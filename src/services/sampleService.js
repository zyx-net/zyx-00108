const dataStore = require('../utils/dataStore');
const auditService = require('./auditService');
const { generateId, now, addDays, isOverdue } = require('../utils/helpers');
const { SAMPLE_STATUS, ACTION_TYPE } = require('../utils/constants');

class SampleService {
  async create(sampleData, operator, operatorRole) {
    const sample = {
      id: generateId('SMP'),
      name: sampleData.name,
      category: sampleData.category,
      validityPeriod: sampleData.validityPeriod,
      storageLocation: sampleData.storageLocation,
      status: SAMPLE_STATUS.AVAILABLE,
      currentHolder: null,
      borrowDate: null,
      dueDate: null,
      createdAt: now(),
      updatedAt: now(),
      version: 1
    };

    await dataStore.insert('samples', sample);
    
    await auditService.log(
      ACTION_TYPE.SAMPLE_REGISTERED,
      operator,
      operatorRole,
      sample,
      { action: 'Register new sample' },
      'SUCCESS'
    );

    return sample;
  }

  async findById(id) {
    return await dataStore.findById('samples', id);
  }

  async findAll(filters = {}) {
    const { status, category, page = 1, limit = 20 } = filters;
    
    let samples = await dataStore.read('samples');
    
    if (status) {
      samples = samples.filter(s => s.status === status);
    }
    
    if (category) {
      samples = samples.filter(s => s.category === category);
    }
    
    samples.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    const total = samples.length;
    const startIndex = (page - 1) * limit;
    const paginatedSamples = samples.slice(startIndex, startIndex + limit);
    
    return { samples: paginatedSamples, total };
  }

  async update(id, updates, operator, operatorRole) {
    const sample = await this.findById(id);
    
    if (!sample) {
      throw new Error('Sample not found');
    }

    const allowedUpdates = {};
    if (updates.storageLocation) allowedUpdates.storageLocation = updates.storageLocation;
    if (updates.validityPeriod) allowedUpdates.validityPeriod = updates.validityPeriod;
    if (updates.name) allowedUpdates.name = updates.name;
    if (updates.category) allowedUpdates.category = updates.category;

    const updatedSample = await dataStore.update(id, allowedUpdates);
    
    await auditService.log(
      ACTION_TYPE.SAMPLE_UPDATED,
      operator,
      operatorRole,
      updatedSample,
      { changes: allowedUpdates },
      'SUCCESS'
    );

    return updatedSample;
  }

  async borrow(sampleId, borrower, dueDate, operator, operatorRole) {
    const sample = await this.findById(sampleId);
    
    if (!sample) {
      throw new Error('Sample not found');
    }

    if (sample.status !== SAMPLE_STATUS.AVAILABLE) {
      throw new Error(`Cannot borrow sample in status: ${sample.status}`);
    }

    const result = await dataStore.updateWithVersion(
      'samples',
      sampleId,
      {
        status: SAMPLE_STATUS.BORROWED,
        currentHolder: borrower,
        borrowDate: now(),
        dueDate
      },
      sample.version
    );

    if (!result.success) {
      if (result.error === 'VERSION_CONFLICT') {
        throw new Error('Sample was modified by another request, please retry');
      }
      throw new Error('Failed to update sample');
    }

    await auditService.log(
      ACTION_TYPE.SAMPLE_BORROWED,
      borrower,
      operatorRole,
      result.data,
      { borrower, dueDate },
      'SUCCESS'
    );

    return result.data;
  }

  async return(sampleId, operator, operatorRole) {
    const sample = await this.findById(sampleId);
    
    if (!sample) {
      throw new Error('Sample not found');
    }

    if (sample.status === SAMPLE_STATUS.DESTROYED) {
      await auditService.log(
        ACTION_TYPE.ERROR_OCCURRED,
        operator,
        operatorRole,
        sample,
        { action: 'Return destroyed sample' },
        'FAILURE',
        'Sample has been destroyed and cannot be returned'
      );
      throw new Error('Sample has been destroyed and cannot be returned');
    }

    if (sample.status !== SAMPLE_STATUS.BORROWED && sample.status !== SAMPLE_STATUS.OVERDUE) {
      throw new Error('Sample is not currently borrowed');
    }

    const result = await dataStore.updateWithVersion(
      'samples',
      sampleId,
      {
        status: SAMPLE_STATUS.AVAILABLE,
        currentHolder: null,
        borrowDate: null,
        dueDate: null
      },
      sample.version
    );

    if (!result.success) {
      if (result.error === 'VERSION_CONFLICT') {
        throw new Error('Sample was modified by another request, please retry');
      }
      throw new Error('Failed to update sample');
    }

    await auditService.log(
      ACTION_TYPE.SAMPLE_RETURNED,
      operator,
      operatorRole,
      result.data,
      { returnedBy: operator },
      'SUCCESS'
    );

    return result.data;
  }

  async renew(sampleId, newDueDate, operator, operatorRole) {
    const sample = await this.findById(sampleId);
    
    if (!sample) {
      throw new Error('Sample not found');
    }

    if (sample.status === SAMPLE_STATUS.FROZEN) {
      await auditService.log(
        ACTION_TYPE.ERROR_OCCURRED,
        operator,
        operatorRole,
        sample,
        { action: 'Renew frozen sample' },
        'FAILURE',
        'Sample is frozen and cannot be renewed'
      );
      throw new Error('Sample is frozen and cannot be renewed');
    }

    if (sample.status === SAMPLE_STATUS.DESTROYED) {
      await auditService.log(
        ACTION_TYPE.ERROR_OCCURRED,
        operator,
        operatorRole,
        sample,
        { action: 'Renew destroyed sample' },
        'FAILURE',
        'Sample has been destroyed and cannot be renewed'
      );
      throw new Error('Sample has been destroyed and cannot be renewed');
    }

    if (sample.status !== SAMPLE_STATUS.BORROWED && sample.status !== SAMPLE_STATUS.OVERDUE) {
      throw new Error('Sample is not currently borrowed');
    }

    const result = await dataStore.updateWithVersion(
      'samples',
      sampleId,
      {
        dueDate: newDueDate,
        status: SAMPLE_STATUS.BORROWED
      },
      sample.version
    );

    if (!result.success) {
      if (result.error === 'VERSION_CONFLICT') {
        throw new Error('Sample was modified by another request, please retry');
      }
      throw new Error('Failed to update sample');
    }

    await auditService.log(
      ACTION_TYPE.SAMPLE_RENEWED,
      operator,
      operatorRole,
      result.data,
      { newDueDate },
      'SUCCESS'
    );

    return result.data;
  }

  async freeze(sampleId, operator, operatorRole, reason) {
    const sample = await this.findById(sampleId);
    
    if (!sample) {
      throw new Error('Sample not found');
    }

    if (sample.status === SAMPLE_STATUS.DESTROYED) {
      throw new Error('Cannot freeze destroyed sample');
    }

    const result = await dataStore.updateWithVersion(
      'samples',
      sampleId,
      { status: SAMPLE_STATUS.FROZEN },
      sample.version
    );

    if (!result.success) {
      if (result.error === 'VERSION_CONFLICT') {
        throw new Error('Sample was modified by another request, please retry');
      }
      throw new Error('Failed to update sample');
    }

    await auditService.log(
      ACTION_TYPE.SAMPLE_FROZEN,
      operator,
      operatorRole,
      result.data,
      { reason },
      'SUCCESS'
    );

    return result.data;
  }

  async unfreeze(sampleId, operator, operatorRole, reason) {
    const sample = await this.findById(sampleId);
    
    if (!sample) {
      throw new Error('Sample not found');
    }

    if (sample.status !== SAMPLE_STATUS.FROZEN) {
      throw new Error('Sample is not frozen');
    }

    const updates = {};
    if (!sample.borrowDate) {
      updates.status = SAMPLE_STATUS.AVAILABLE;
    } else {
      updates.status = isOverdue(sample.dueDate) ? SAMPLE_STATUS.OVERDUE : SAMPLE_STATUS.BORROWED;
    }

    const result = await dataStore.updateWithVersion(
      'samples',
      sampleId,
      updates,
      sample.version
    );

    if (!result.success) {
      if (result.error === 'VERSION_CONFLICT') {
        throw new Error('Sample was modified by another request, please retry');
      }
      throw new Error('Failed to update sample');
    }

    await auditService.log(
      ACTION_TYPE.SAMPLE_UNFROZEN,
      operator,
      operatorRole,
      result.data,
      { reason, previousStatus: sample.status },
      'SUCCESS'
    );

    return result.data;
  }

  async markForDestruction(sampleId, operator, operatorRole) {
    const sample = await this.findById(sampleId);
    
    if (!sample) {
      throw new Error('Sample not found');
    }

    if (sample.status === SAMPLE_STATUS.DESTROYED) {
      throw new Error('Sample is already destroyed');
    }

    const result = await dataStore.updateWithVersion(
      'samples',
      sampleId,
      {
        status: SAMPLE_STATUS.PENDING_DESTRUCTION,
        currentHolder: null
      },
      sample.version
    );

    if (!result.success) {
      if (result.error === 'VERSION_CONFLICT') {
        throw new Error('Sample was modified by another request, please retry');
      }
      throw new Error('Failed to update sample');
    }

    await auditService.log(
      ACTION_TYPE.SAMPLE_DESTROYED,
      operator,
      operatorRole,
      result.data,
      { action: 'Marked for destruction' },
      'SUCCESS'
    );

    return result.data;
  }

  async destroy(sampleId, operator, operatorRole) {
    const sample = await this.findById(sampleId);
    
    if (!sample) {
      throw new Error('Sample not found');
    }

    if (sample.status !== SAMPLE_STATUS.PENDING_DESTRUCTION) {
      throw new Error('Sample is not pending destruction');
    }

    const result = await dataStore.updateWithVersion(
      'samples',
      sampleId,
      {
        status: SAMPLE_STATUS.DESTROYED,
        currentHolder: null,
        borrowDate: null,
        dueDate: null
      },
      sample.version
    );

    if (!result.success) {
      if (result.error === 'VERSION_CONFLICT') {
        throw new Error('Sample was modified by another request, please retry');
      }
      throw new Error('Sample was already destroyed by another request');
    }

    await auditService.log(
      ACTION_TYPE.SAMPLE_DESTROYED,
      operator,
      operatorRole,
      result.data,
      { action: 'Final destruction' },
      'SUCCESS'
    );

    return result.data;
  }

  async markOverdue() {
    const samples = await dataStore.read('samples');
    let markedCount = 0;
    const now = new Date();

    for (const sample of samples) {
      if ((sample.status === SAMPLE_STATUS.BORROWED || sample.status === SAMPLE_STATUS.OVERDUE) 
          && sample.dueDate && new Date(sample.dueDate) < now) {
        
        const result = await dataStore.updateWithVersion(
          'samples',
          sample.id,
          { status: SAMPLE_STATUS.OVERDUE },
          sample.version
        );

        if (result.success) {
          markedCount++;
          await auditService.log(
            ACTION_TYPE.SAMPLE_OVERDUE,
            'SYSTEM',
            'SYSTEM',
            result.data,
            { dueDate: sample.dueDate },
            'SUCCESS'
          );
        }
      }
    }

    return markedCount;
  }
}

module.exports = new SampleService();
