const zlib = require("zlib");

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function decodeXmlEntities(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function assertPng(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < PNG_SIGNATURE.length) {
    throw new Error("PNG payload is empty or invalid");
  }
  if (!buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error("Uploaded file is not a PNG");
  }
}

function readNullTerminatedBytes(buffer, offset) {
  let index = offset;
  while (index < buffer.length && buffer[index] !== 0x00) {
    index += 1;
  }
  if (index >= buffer.length) {
    return null;
  }
  return {
    valueBytes: buffer.subarray(offset, index),
    nextOffset: index + 1,
  };
}

function parseTextChunkData(type, data) {
  const head = readNullTerminatedBytes(data, 0);
  if (!head) {
    return null;
  }
  const key = head.valueBytes.toString("latin1").trim();
  if (!key) {
    return null;
  }

  if (type === "tEXt") {
    const value = data.subarray(head.nextOffset).toString("latin1").trim();
    return value ? { key, value } : null;
  }

  if (type === "zTXt") {
    if (head.nextOffset >= data.length) {
      return null;
    }
    const compressionMethod = data[head.nextOffset];
    if (compressionMethod !== 0) {
      return null;
    }
    const compressed = data.subarray(head.nextOffset + 1);
    const value = zlib.inflateSync(compressed).toString("utf8").trim();
    return value ? { key, value } : null;
  }

  if (type === "iTXt") {
    if (head.nextOffset + 2 > data.length) {
      return null;
    }
    const compressionFlag = data[head.nextOffset];
    const compressionMethod = data[head.nextOffset + 1];

    const languageTag = readNullTerminatedBytes(data, head.nextOffset + 2);
    if (!languageTag) {
      return null;
    }
    const translatedKeyword = readNullTerminatedBytes(data, languageTag.nextOffset);
    if (!translatedKeyword) {
      return null;
    }

    const textBytes = data.subarray(translatedKeyword.nextOffset);
    let value;
    if (compressionFlag === 1) {
      if (compressionMethod !== 0) {
        return null;
      }
      value = zlib.inflateSync(textBytes).toString("utf8").trim();
    } else {
      value = textBytes.toString("utf8").trim();
    }
    return value ? { key, value } : null;
  }

  return null;
}

function parsePngTextEntries(buffer) {
  assertPng(buffer);

  const entries = [];
  let offset = PNG_SIGNATURE.length;

  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const crcEnd = dataEnd + 4;
    if (crcEnd > buffer.length) {
      throw new Error("PNG chunk length exceeds file size");
    }

    if (type === "tEXt" || type === "zTXt" || type === "iTXt") {
      const parsed = parseTextChunkData(type, buffer.subarray(dataStart, dataEnd));
      if (parsed) {
        entries.push({
          key: parsed.key,
          value: parsed.value,
          chunkType: type,
        });
      }
    }

    offset = crcEnd;
    if (type === "IEND") {
      break;
    }
  }

  return entries;
}

function findByKey(entries, candidates) {
  const lowered = new Set(candidates.map((value) => String(value).toLowerCase()));
  for (const entry of entries) {
    if (lowered.has(String(entry.key || "").toLowerCase()) && String(entry.value || "").trim() !== "") {
      return String(entry.value).trim();
    }
  }
  return "";
}

function parseXmpFields(xmpRaw) {
  const xmp = String(xmpRaw || "");
  if (!xmp.trim()) {
    return {};
  }

  const descriptionMatch = xmp.match(/<dc:description[\s\S]*?<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/i);
  const authorMatch = xmp.match(/<dc:creator[\s\S]*?<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/i);
  const createDateMatch = xmp.match(/<(?:xmp:CreateDate|photoshop:DateCreated)>([\s\S]*?)<\/(?:xmp:CreateDate|photoshop:DateCreated)>/i);
  const jobIdMatch = xmp.match(/Job ID:\s*([0-9a-f-]{36})/i);

  return {
    description: descriptionMatch ? decodeXmlEntities(descriptionMatch[1]) : "",
    author: authorMatch ? decodeXmlEntities(authorMatch[1]) : "",
    creationTime: createDateMatch ? decodeXmlEntities(createDateMatch[1]) : "",
    jobId: jobIdMatch ? jobIdMatch[1].toLowerCase() : "",
  };
}

function extractMidjourneyFieldsFromPngBuffer(buffer) {
  const entries = parsePngTextEntries(buffer);

  const directDescription = findByKey(entries, ["Description", "Comment"]);
  const directAuthor = findByKey(entries, ["Author", "Creator"]);
  const directCreationTime = findByKey(entries, ["Creation Time", "CreateDate", "DateTimeOriginal"]);
  const directJobId = findByKey(entries, ["Job ID", "JobID", "DigImageGUID"]);

  const xmpEntry = entries.find((entry) => /xmp/i.test(entry.key) || /<x:xmpmeta/i.test(entry.value));
  const xmpFields = parseXmpFields(xmpEntry ? xmpEntry.value : "");

  const description = directDescription || xmpFields.description;
  const author = directAuthor || xmpFields.author;
  const creationTime = directCreationTime || xmpFields.creationTime;
  const jobId = directJobId || xmpFields.jobId;

  if (!description) {
    throw new Error("Missing required metadata field: Description");
  }

  const metadataFields = [{ key: "Description", value: description }];
  if (author) {
    metadataFields.push({ key: "Author", value: author });
  }
  if (creationTime) {
    metadataFields.push({ key: "Creation Time", value: creationTime });
  }
  if (jobId) {
    metadataFields.push({ key: "Job ID", value: jobId });
  }

  return {
    metadataFields,
    entryCount: entries.length,
  };
}

module.exports = {
  parsePngTextEntries,
  extractMidjourneyFieldsFromPngBuffer,
};
