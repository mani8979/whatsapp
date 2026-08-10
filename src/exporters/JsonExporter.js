import fs from 'fs-extra';
import BaseExporter from './BaseExporter.js';

export class JsonExporter extends BaseExporter {
  async prepare(filePath) {
    // Handled synchronously
  }

  /**
   * Generates a flat JSON file.
   * @param {Array<Object>} contacts Flat list of contacts
   * @param {string} filePath Path to save the JSON file
   */
  async export(contacts, filePath) {
    await fs.writeJson(filePath, contacts, { spaces: 2 });
  }
}
export default JsonExporter;
