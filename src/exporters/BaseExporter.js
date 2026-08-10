/**
 * Base Exporter contract interface class.
 * All target formats (XLSX, CSV, JSON, etc.) should extend this.
 */
export class BaseExporter {
  /**
   * Prepares the file handles or headers.
   * @param {string} filePath File path destination
   */
  async prepare(filePath) {
    throw new Error('Exporter.prepare() must be implemented');
  }

  /**
   * Exports the normalized data to file.
   * @param {Array<Object>} contacts Filtered and unique contacts list
   * @param {string} filePath Output path
   * @param {Object} [stats={}] Performance and sync statistics
   */
  async export(contacts, filePath, stats = {}) {
    throw new Error('Exporter.export() must be implemented');
  }

  /**
   * Finalizes file descriptors, connections, or streams.
   */
  async finish() {
    // Optional hook
  }
}
export default BaseExporter;
