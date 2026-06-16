export class ZipHandler {
  constructor(jszip) {
    if (!jszip) {
      throw new Error("JSZip is not loaded. Add JSZip v3.10.1 at lib/jszip.min.js.");
    }
    this.JSZip = jszip;
    this.zip = null;
  }

  async load(file) {
    this.zip = await this.JSZip.loadAsync(file);
    return this;
  }

  has(path) {
    return Boolean(this.zip.file(path));
  }

  async text(path) {
    const file = this.zip.file(path);
    return file ? file.async("text") : null;
  }

  async blob(path) {
    const file = this.zip.file(path);
    return file ? file.async("blob") : null;
  }

  writeText(path, text) {
    this.zip.file(path, text);
  }

  writeBinary(path, data) {
    this.zip.file(path, data);
  }

  remove(path) {
    this.zip.remove(path);
  }

  paths(pattern) {
    return Object.keys(this.zip.files)
      .filter((path) => !this.zip.files[path].dir)
      .filter((path) => pattern.test(path))
      .sort();
  }

  async generateBlob(onUpdate) {
    return this.zip.generateAsync(
      {
        type: "blob",
        mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        compression: "DEFLATE"
      },
      onUpdate
    );
  }
}
