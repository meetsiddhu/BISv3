// ─────────────────────────────────────────────────────────────────────────────
// REUSABLE PLUGIN: mass-upload — source-file retention entity. Self-contained + additive.
// Stores the raw uploaded file (CSV/Excel bytes) per upload batch, reusing the in-DB
// attachment pattern (LargeBinary). Portable: another app gets retention for free.
// ─────────────────────────────────────────────────────────────────────────────
namespace plugins.upload;
using { cuid, managed } from '@sap/cds/common';

entity UploadSourceFile : cuid, managed {
  batchId    : String(40);          // groups the file with its MassUploadLog + ChangeLog rows
  dataset    : String(80);          // which dataset descriptor processed it
  fileName   : String(255);
  mimeType   : String(100);
  byteSize   : Integer;
  rowCount   : Integer;             // rows parsed from the file
  content    : LargeBinary;         // the raw uploaded bytes (retained source)
  uploadedBy : String(111);
  uploadedAt : Timestamp;
}
