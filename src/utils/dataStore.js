const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '../../data');

class DataStore {
  constructor() {
    this.locks = new Map();
  }

  async acquireLock(resourceId) {
    const lockId = crypto.randomUUID();
    const maxWait = 5000;
    const startTime = Date.now();
    
    while (this.locks.has(resourceId)) {
      if (Date.now() - startTime > maxWait) {
        throw new Error(`Lock acquisition timeout for resource: ${resourceId}`);
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    this.locks.set(resourceId, lockId);
    return lockId;
  }

  async releaseLock(resourceId, lockId) {
    if (this.locks.get(resourceId) === lockId) {
      this.locks.delete(resourceId);
    }
  }

  ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  getFilePath(collection) {
    return path.join(DATA_DIR, `${collection}.json`);
  }

  async read(collection) {
    const filePath = this.getFilePath(collection);
    this.ensureDataDir();
    
    if (!fs.existsSync(filePath)) {
      return [];
    }
    
    const content = fs.readFileSync(filePath, 'utf-8');
    return content ? JSON.parse(content) : [];
  }

  async write(collection, data) {
    const filePath = this.getFilePath(collection);
    this.ensureDataDir();
    
    const tempFile = filePath + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    fs.renameSync(tempFile, filePath);
  }

  async findById(collection, id) {
    const data = await this.read(collection);
    return data.find(item => item.id === id);
  }

  async findOne(collection, predicate) {
    const data = await this.read(collection);
    return data.find(predicate);
  }

  async find(collection, predicate) {
    const data = await this.read(collection);
    return predicate ? data.filter(predicate) : data;
  }

  async insert(collection, item) {
    const data = await this.read(collection);
    data.push(item);
    await this.write(collection, data);
    return item;
  }

  async update(collection, id, updates) {
    const data = await this.read(collection);
    const index = data.findIndex(item => item.id === id);
    
    if (index === -1) {
      return null;
    }
    
    data[index] = { ...data[index], ...updates, updatedAt: new Date().toISOString() };
    await this.write(collection, data);
    return data[index];
  }

  async updateWithVersion(collection, id, updates, expectedVersion) {
    const data = await this.read(collection);
    const index = data.findIndex(item => item.id === id);
    
    if (index === -1) {
      return { success: false, error: 'NOT_FOUND' };
    }
    
    if (data[index].version !== expectedVersion) {
      return { success: false, error: 'VERSION_CONFLICT', current: data[index] };
    }
    
    data[index] = { 
      ...data[index], 
      ...updates, 
      version: data[index].version + 1,
      updatedAt: new Date().toISOString() 
    };
    await this.write(collection, data);
    return { success: true, data: data[index] };
  }

  async delete(collection, id) {
    const data = await this.read(collection);
    const index = data.findIndex(item => item.id === id);
    
    if (index === -1) {
      return false;
    }
    
    data.splice(index, 1);
    await this.write(collection, data);
    return true;
  }

  async atomicUpdate(collection, id, updateFn) {
    const lockId = await this.acquireLock(`${collection}:${id}`);
    
    try {
      const data = await this.read(collection);
      const index = data.findIndex(item => item.id === id);
      
      if (index === -1) {
        return { success: false, error: 'NOT_FOUND' };
      }
      
      const result = updateFn(data[index], data);
      
      if (result.success === false) {
        return result;
      }
      
      data[index] = result.data;
      await this.write(collection, data);
      return { success: true, data: result.data };
    } finally {
      await this.releaseLock(`${collection}:${id}`, lockId);
    }
  }
}

module.exports = new DataStore();
