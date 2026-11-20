import mongoose from 'mongoose';
import {
  EvidenceChannel,
  EvidenceProvider,
  TemplateLifecycleStatus,
  TransactionType,
  EvidenceTemplate,
  TemplateVersionHistory
} from '@rgs-ledger/shared-types';
import { EvidenceTemplateModel, PaymentEvidenceModel, AuditLogModel } from '../../database/models.js';

export interface CreateTemplateInput {
  channel: EvidenceChannel;
  provider?: EvidenceProvider;
  bankAccountId?: string;
  senderIdentifier?: string;
  packageName?: string;
  senderHeader?: string;
  name: string;
  description?: string;
  regexPattern: string;
  fieldsMap: {
    amountPaiseExtractor?: string;
    utrExtractor?: string;
    accountExtractor?: string;
    transactionTimestampExtractor?: string;
    transactionTypeExtractor?: string;
  };
  samplePayload?: string;
  initialStatus?: TemplateLifecycleStatus;
}

export interface UpdateTemplateInput {
  name?: string;
  description?: string;
  bankAccountId?: string;
  senderIdentifier?: string;
  packageName?: string;
  senderHeader?: string;
  regexPattern?: string;
  fieldsMap?: Record<string, string>;
  samplePayload?: string;
  changeReason?: string;
}

export interface ExtractedTemplateFields {
  amountPaise?: number;
  amountRupees?: string;
  utr?: string;
  accountIdentifier?: string;
  transactionType?: TransactionType;
  transactionTimestamp?: Date;
  rawMatches?: Record<string, string>;
}

export interface TemplateFilter {
  channel?: EvidenceChannel;
  status?: TemplateLifecycleStatus;
  bankAccountId?: string;
  includeArchived?: boolean;
  isActive?: boolean;
}

export interface ITemplateRepository {
  create(merchantId: string, data: any): Promise<any>;
  findById(merchantId: string, templateId: string): Promise<any>;
  list(merchantId: string, filter?: TemplateFilter): Promise<any[]>;
  findActive?(merchantId: string, filter?: { channel?: EvidenceChannel; bankAccountId?: string }): Promise<any[]>;
  delete?(merchantId: string, templateId: string): Promise<any>;
  hasEvidenceDependencies?(merchantId: string, templateId: string): Promise<boolean>;
  save(templateDoc: any): Promise<any>;
}

export class MongoTemplateRepository implements ITemplateRepository {
  async create(merchantId: string, data: any): Promise<any> {
    return EvidenceTemplateModel.create({ ...data, merchantId });
  }

  async findById(merchantId: string, templateId: string): Promise<any> {
    if (!mongoose.isValidObjectId(templateId) || templateId === 'undefined') {
      return null;
    }
    return EvidenceTemplateModel.findOne({ _id: templateId, merchantId });
  }

  async list(merchantId: string, filter?: TemplateFilter): Promise<any[]> {
    const query: Record<string, any> = { merchantId };
    if (filter?.channel) query.channel = filter.channel;
    if (filter?.status) {
      query.status = filter.status;
    } else if (filter?.includeArchived !== true) {
      query.status = { $ne: TemplateLifecycleStatus.ARCHIVED };
      query.isArchived = { $ne: true };
    }
    if (filter?.isActive !== undefined) {
      query.isActive = filter.isActive;
    }
    if (filter?.bankAccountId) query.bankAccountId = filter.bankAccountId;
    return EvidenceTemplateModel.find(query).sort({ updatedAt: -1 });
  }

  async findActive(merchantId: string, filter?: { channel?: EvidenceChannel; bankAccountId?: string }): Promise<any[]> {
    const query: Record<string, any> = {
      merchantId,
      status: TemplateLifecycleStatus.APPROVED,
      isActive: true,
      isArchived: { $ne: true }
    };
    if (filter?.channel) query.channel = filter.channel;
    if (filter?.bankAccountId) query.bankAccountId = filter.bankAccountId;
    return EvidenceTemplateModel.find(query);
  }

  async delete(merchantId: string, templateId: string): Promise<any> {
    return EvidenceTemplateModel.deleteOne({ _id: templateId, merchantId });
  }

  async hasEvidenceDependencies(merchantId: string, templateId: string): Promise<boolean> {
    const exists = await PaymentEvidenceModel.exists({
      merchantId,
      templateId: new mongoose.Types.ObjectId(templateId)
    });
    return !!exists;
  }

  async save(templateDoc: any): Promise<any> {
    return templateDoc.save();
  }
}

export class TemplateManager {
  private repository: ITemplateRepository;

  constructor(repository: ITemplateRepository = new MongoTemplateRepository()) {
    this.repository = repository;
  }

  /**
   * Normalizes document to include both string `id` and `_id` and explicit lifecycle states
   */
  private formatTemplate(doc: any): EvidenceTemplate {
    const obj = doc && doc.toObject ? doc.toObject() : { ...doc };
    const idStr = (obj._id || obj.id)?.toString();
    const isApproved = obj.status === TemplateLifecycleStatus.APPROVED;
    const isArchived = obj.status === TemplateLifecycleStatus.ARCHIVED || obj.isArchived === true;
    const isActive = obj.isActive !== undefined ? Boolean(obj.isActive) : (isApproved && !isArchived);

    return {
      ...obj,
      id: idStr,
      _id: idStr,
      isActive,
      isArchived: Boolean(isArchived),
      historyCount: obj.history?.length || 0
    } as EvidenceTemplate;
  }

  /**
   * Normalizes notification text by stripping harmful zero-width spaces,
   * converting non-breaking/special whitespace to standard spaces,
   * standardizing Windows/Mac line endings (\r\n and \r) to \n,
   * and collapsing harmless duplicate horizontal spacing.
   */
  public static normalizeNotificationText(rawText: string): string {
    if (!rawText) return '';
    return rawText
      // Remove zero-width characters (BOM, zero-width space, word joiner, etc.)
      .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
      // Replace non-breaking spaces and other special unicode whitespace with standard ASCII space
      .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
      // Standardize Windows (\r\n) and classic Mac (\r) line breaks to standard Unix (\n)
      .replace(/\r\n|\r/g, '\n')
      // Collapse multiple horizontal spaces/tabs on the same line into a single space
      .replace(/[^\S\r\n]+/g, ' ')
      // Trim whitespace on each line before linebreaks
      .replace(/[^\S\r\n]+(?=\n)/g, '')
      // Trim whitespace immediately after linebreaks
      .replace(/(?<=\n)[^\S\r\n]+/g, '')
      // Collapse 3+ consecutive linebreaks into max 2 linebreaks
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * Creates a new evidence template for a merchant.
   * New templates default to DISCOVERED or PENDING_APPROVAL and are never auto-approved.
   */
  public async createTemplate(
    merchantId: string,
    data: CreateTemplateInput,
    userId?: string
  ): Promise<EvidenceTemplate> {
    if (!merchantId) throw new Error('Merchant ID is mandatory for creating a template.');

    // Validate regex pattern syntax
    try {
      new RegExp(data.regexPattern);
    } catch (err: any) {
      throw new Error(`Invalid regex pattern: ${err.message}`);
    }

    const initialStatus = data.initialStatus || TemplateLifecycleStatus.PENDING_APPROVAL;

    const initialHistory: TemplateVersionHistory[] = [
      {
        version: 1,
        regexPattern: data.regexPattern,
        fieldsMap: data.fieldsMap as Record<string, string>,
        status: initialStatus,
        isActive: false,
        modifiedByUserId: userId,
        changeReason: 'Initial template creation',
        createdAt: new Date()
      }
    ];

    const senderId = data.senderIdentifier || data.senderHeader || data.packageName || '*';
    const templateDoc = await this.repository.create(merchantId, {
      channel: data.channel,
      provider: data.provider,
      bankAccountId: data.bankAccountId,
      senderIdentifier: senderId,
      packageName: data.packageName,
      senderHeader: data.senderHeader,
      name: data.name,
      description: data.description,
      regexPattern: data.regexPattern,
      fieldsMap: data.fieldsMap,
      samplePayload: data.samplePayload,
      version: 1,
      status: initialStatus,
      isActive: false,
      isArchived: false,
      isImmutable: false,
      history: initialHistory
    });

    await AuditLogModel.create({
      merchantId,
      userId,
      action: 'TEMPLATE_CREATED',
      resource: 'evidence_templates',
      resourceId: (templateDoc._id || templateDoc.id)?.toString(),
      details: { name: templateDoc.name, channel: templateDoc.channel, status: initialStatus }
    }).catch(() => {});

    return this.formatTemplate(templateDoc);
  }

  /**
   * Retrieves a template by ID strictly scoped to merchantId.
   */
  public async getTemplateById(merchantId: string, templateId: string): Promise<EvidenceTemplate | null> {
    const doc = await this.repository.findById(merchantId, templateId);
    if (!doc) return null;
    return this.formatTemplate(doc);
  }

  /**
   * Lists templates for a merchant with optional filtering.
   */
  public async listTemplates(
    merchantId: string,
    filter?: TemplateFilter
  ): Promise<EvidenceTemplate[]> {
    const docs = await this.repository.list(merchantId, filter);
    return docs.map((d: any) => this.formatTemplate(d));
  }

  /**
   * Updates a template adhering to the immutability protocol:
   * If the template is currently APPROVED, editing regexPattern or fieldsMap MUST create version n+1 in PENDING_APPROVAL,
   * archiving version n in the history array.
   */
  public async updateTemplate(
    merchantId: string,
    templateId: string,
    updates: UpdateTemplateInput,
    userId?: string
  ): Promise<EvidenceTemplate> {
    const template = await this.repository.findById(merchantId, templateId);
    if (!template) {
      throw new Error('Template not found or access denied.');
    }

    if (template.status === TemplateLifecycleStatus.DISABLED) {
      throw new Error('Cannot update a DISABLED template. Re-activate or create a new template.');
    }

    if (template.status === TemplateLifecycleStatus.ARCHIVED || template.isArchived) {
      throw new Error('Cannot update an ARCHIVED template. Restore it before making changes.');
    }

    // Validate new regex if provided
    if (updates.regexPattern) {
      try {
        new RegExp(updates.regexPattern);
      } catch (err: any) {
        throw new Error(`Invalid regex pattern: ${err.message}`);
      }
    }

    const isCurrentlyApproved = template.status === TemplateLifecycleStatus.APPROVED;
    const hasCoreRuleChanges = !!(updates.regexPattern || updates.fieldsMap);

    if (isCurrentlyApproved && hasCoreRuleChanges) {
      // Archive current approved version into history
      template.history.push({
        version: template.version,
        regexPattern: template.regexPattern,
        fieldsMap: template.fieldsMap,
        status: template.status,
        isActive: template.isActive,
        modifiedByUserId: userId,
        changeReason: updates.changeReason || `Upgraded to version ${template.version + 1}`,
        createdAt: new Date()
      });

      // Increment version and reset to PENDING_APPROVAL
      template.version += 1;
      template.status = TemplateLifecycleStatus.PENDING_APPROVAL;
      template.isActive = false;
      template.isImmutable = false;
      template.approvedByUserId = undefined;
      template.approvedAt = undefined;

      if (updates.regexPattern) template.regexPattern = updates.regexPattern;
      if (updates.fieldsMap) template.fieldsMap = { ...template.fieldsMap, ...updates.fieldsMap };
      if (updates.name) template.name = updates.name;
      if (updates.description !== undefined) template.description = updates.description;
      if (updates.bankAccountId !== undefined) template.bankAccountId = updates.bankAccountId;
      if (updates.samplePayload !== undefined) template.samplePayload = updates.samplePayload;
      if (updates.packageName !== undefined) template.packageName = updates.packageName;
      if (updates.senderHeader !== undefined) template.senderHeader = updates.senderHeader;
      if (updates.senderIdentifier !== undefined) template.senderIdentifier = updates.senderIdentifier;

      await AuditLogModel.create({
        merchantId,
        userId,
        action: 'TEMPLATE_VERSION_INCREMENTED',
        resource: 'evidence_templates',
        resourceId: (template._id || template.id)?.toString(),
        details: { newVersion: template.version, reason: updates.changeReason }
      }).catch(() => {});
    } else {
      // Direct update for draft/pending templates or metadata-only changes
      if (updates.name) template.name = updates.name;
      if (updates.description !== undefined) template.description = updates.description;
      if (updates.bankAccountId !== undefined) template.bankAccountId = updates.bankAccountId;
      if (updates.samplePayload !== undefined) template.samplePayload = updates.samplePayload;
      if (updates.packageName !== undefined) template.packageName = updates.packageName;
      if (updates.senderHeader !== undefined) template.senderHeader = updates.senderHeader;
      if (updates.senderIdentifier !== undefined) template.senderIdentifier = updates.senderIdentifier;
      if (updates.regexPattern && !isCurrentlyApproved) template.regexPattern = updates.regexPattern;
      if (updates.fieldsMap && !isCurrentlyApproved) {
        template.fieldsMap = { ...template.fieldsMap, ...updates.fieldsMap };
      }
    }

    await this.repository.save(template);
    return this.formatTemplate(template);
  }

  /**
   * Approves a template version, making it immutable and active.
   * Enforces mandatory sample verification against supplied or stored sample payload.
   */
  public async approveTemplate(
    merchantId: string,
    templateId: string,
    targetVersion: number,
    userId: string,
    approvalNotes?: string,
    samplePayload?: string
  ): Promise<EvidenceTemplate> {
    const template = await this.repository.findById(merchantId, templateId);
    if (!template) {
      throw new Error('Template not found or access denied.');
    }

    if (template.version !== targetVersion) {
      throw new Error(`Version mismatch: requested approval for version ${targetVersion}, but current is ${template.version}`);
    }

    const sample = samplePayload || template.samplePayload;
    if (sample && sample.trim()) {
      // Run verification extraction
      const verificationTemplate: EvidenceTemplate = {
        ...(template.toObject ? template.toObject() : template),
        status: TemplateLifecycleStatus.APPROVED,
        isActive: true
      };
      const extracted = TemplateManager.matchAndExtract(verificationTemplate, sample);

      if (!extracted) {
        throw new Error('TEMPLATE_SAMPLE_VERIFICATION_FAILED: Template regex pattern did not match the provided sample text.');
      }

      if (!extracted.amountPaise || extracted.amountPaise <= 0) {
        throw new Error('TEMPLATE_SAMPLE_VERIFICATION_FAILED: Failed to extract a valid positive amount (amountPaise) from sample text.');
      }

      if (!extracted.utr && !extracted.accountIdentifier) {
        throw new Error('TEMPLATE_SAMPLE_VERIFICATION_FAILED: Failed to extract either a UTR or an account identifier from sample text.');
      }
    }

    template.status = TemplateLifecycleStatus.APPROVED;
    template.isActive = true;
    template.isArchived = false;
    template.isImmutable = true;
    template.approvedByUserId = userId as any;
    template.approvedAt = new Date();
    if (samplePayload) {
      template.samplePayload = samplePayload;
    }

    template.history = template.history || [];
    template.history.push({
      version: template.version,
      regexPattern: template.regexPattern,
      fieldsMap: template.fieldsMap,
      status: TemplateLifecycleStatus.APPROVED,
      isActive: true,
      modifiedByUserId: userId,
      changeReason: approvalNotes || `Version ${targetVersion} approved by merchant administrator after successful sample verification`,
      createdAt: new Date()
    });

    await this.repository.save(template);

    await AuditLogModel.create({
      merchantId,
      userId,
      action: 'TEMPLATE_APPROVED',
      resource: 'evidence_templates',
      resourceId: (template._id || template.id)?.toString(),
      details: { version: targetVersion, name: template.name }
    }).catch(() => {});

    return this.formatTemplate(template);
  }

  /**
   * Disables an active or pending template.
   */
  public async disableTemplate(
    merchantId: string,
    templateId: string,
    userId?: string,
    reason?: string
  ): Promise<EvidenceTemplate> {
    const template = await this.repository.findById(merchantId, templateId);
    if (!template) {
      throw new Error('Template not found or access denied.');
    }

    template.status = TemplateLifecycleStatus.DISABLED;
    template.isActive = false;
    template.deactivatedAt = new Date();
    template.isImmutable = true;

    template.history = template.history || [];
    template.history.push({
      version: template.version,
      regexPattern: template.regexPattern,
      fieldsMap: template.fieldsMap,
      status: TemplateLifecycleStatus.DISABLED,
      isActive: false,
      modifiedByUserId: userId,
      changeReason: reason || 'Template disabled',
      createdAt: new Date()
    });

    await this.repository.save(template);

    await AuditLogModel.create({
      merchantId,
      userId,
      action: 'TEMPLATE_DISABLED',
      resource: 'evidence_templates',
      resourceId: (template._id || template.id)?.toString(),
      details: { version: template.version, name: template.name, reason }
    }).catch(() => {});

    return this.formatTemplate(template);
  }

  /**
   * Reactivates a previously approved disabled template without creating a duplicate.
   * Validates pattern, checks for conflicting active templates on the same channel/bankAccount,
   * and optionally switches/disables conflicting templates atomically.
   */
  public async reactivateTemplate(
    merchantId: string,
    templateId: string,
    options?: { switchConflicting?: boolean; userId?: string; notes?: string }
  ): Promise<EvidenceTemplate> {
    const template = await this.repository.findById(merchantId, templateId);
    if (!template) {
      throw new Error('Template not found or access denied.');
    }

    if (template.status === TemplateLifecycleStatus.APPROVED && template.isActive !== false) {
      throw new Error('Template is already active and approved.');
    }

    // Only previously approved templates can be reactivated
    const wasApproved = !!template.approvedAt || (template.history || []).some((h: any) => h.status === TemplateLifecycleStatus.APPROVED);
    if (!wasApproved) {
      throw new Error('CANNOT_REACTIVATE_UNAPPROVED_TEMPLATE: Template has never been approved. Only approved templates can be reactivated.');
    }

    // Validate regex pattern syntax
    try {
      new RegExp(template.regexPattern, 'is');
    } catch (err: any) {
      throw new Error(`Invalid regex pattern in template: ${err.message}`);
    }

    // Validate sample if present
    if (template.samplePayload && template.samplePayload.trim()) {
      const verificationTemplate = {
        ...(template.toObject ? template.toObject() : template),
        status: TemplateLifecycleStatus.APPROVED,
        isActive: true
      };
      const extracted = TemplateManager.matchAndExtract(verificationTemplate, template.samplePayload);
      if (!extracted || !extracted.amountPaise) {
        throw new Error('TEMPLATE_REACTIVATION_VALIDATION_FAILED: Stored template regex failed to extract valid amount from sample text.');
      }
    }

    // Check for conflicting active templates for the same merchant, channel, and bank account
    let conflicting: any[] = [];
    if (this.repository.findActive) {
      const activeList = await this.repository.findActive(merchantId, {
        channel: template.channel,
        bankAccountId: template.bankAccountId ? template.bankAccountId.toString() : undefined
      });
      conflicting = activeList.filter((t: any) => {
        const tId = (t._id || t.id)?.toString();
        const curId = (template._id || template.id)?.toString();
        if (tId === curId) return false;
        // Check bank account alignment (both tied to same bank account or both generic)
        const sameBank = (!template.bankAccountId && !t.bankAccountId) ||
          (template.bankAccountId && t.bankAccountId && template.bankAccountId.toString() === t.bankAccountId.toString());
        return sameBank;
      });
    }

    if (conflicting.length > 0) {
      if (!options?.switchConflicting) {
        const err: any = new Error(`CONFLICTING_ACTIVE_TEMPLATE: Another active template ("${conflicting[0].name}") is already active for this channel and bank account.`);
        err.code = 'CONFLICTING_ACTIVE_TEMPLATE';
        err.conflictingTemplate = {
          id: (conflicting[0]._id || conflicting[0].id)?.toString(),
          name: conflicting[0].name,
          version: conflicting[0].version
        };
        throw err;
      }

      // Safe switch workflow: disable conflicting active templates atomically
      for (const conf of conflicting) {
        conf.status = TemplateLifecycleStatus.DISABLED;
        conf.isActive = false;
        conf.deactivatedAt = new Date();
        conf.history = conf.history || [];
        conf.history.push({
          version: conf.version,
          regexPattern: conf.regexPattern,
          fieldsMap: conf.fieldsMap,
          status: TemplateLifecycleStatus.DISABLED,
          isActive: false,
          modifiedByUserId: options?.userId,
          changeReason: `Deactivated automatically due to activation of template "${template.name}"`,
          createdAt: new Date()
        });
        await this.repository.save(conf);

        await AuditLogModel.create({
          merchantId,
          userId: options?.userId,
          action: 'TEMPLATE_DEACTIVATED_FOR_SWITCH',
          resource: 'evidence_templates',
          resourceId: (conf._id || conf.id)?.toString(),
          details: { replacedByTemplateId: (template._id || template.id)?.toString() }
        }).catch(() => {});
      }
    }

    template.status = TemplateLifecycleStatus.APPROVED;
    template.isActive = true;
    template.isArchived = false;
    template.isImmutable = true;
    template.reactivatedAt = new Date();

    template.history = template.history || [];
    template.history.push({
      version: template.version,
      regexPattern: template.regexPattern,
      fieldsMap: template.fieldsMap,
      status: TemplateLifecycleStatus.APPROVED,
      isActive: true,
      modifiedByUserId: options?.userId,
      changeReason: options?.notes || 'Reactivated existing approved template',
      createdAt: new Date()
    });

    await this.repository.save(template);

    await AuditLogModel.create({
      merchantId,
      userId: options?.userId,
      action: 'TEMPLATE_REACTIVATED',
      resource: 'evidence_templates',
      resourceId: (template._id || template.id)?.toString(),
      details: { version: template.version, name: template.name }
    }).catch(() => {});

    return this.formatTemplate(template);
  }

  /**
   * Safely archives a template. Archived templates are stopped from all new evidence extraction
   * but their historical links and approval history remain strictly preserved.
   */
  public async archiveTemplate(
    merchantId: string,
    templateId: string,
    userId?: string,
    reason?: string
  ): Promise<EvidenceTemplate> {
    const template = await this.repository.findById(merchantId, templateId);
    if (!template) {
      throw new Error('Template not found or access denied.');
    }

    template.status = TemplateLifecycleStatus.ARCHIVED;
    template.isActive = false;
    template.isArchived = true;
    template.archivedAt = new Date();

    template.history = template.history || [];
    template.history.push({
      version: template.version,
      regexPattern: template.regexPattern,
      fieldsMap: template.fieldsMap,
      status: TemplateLifecycleStatus.ARCHIVED,
      isActive: false,
      modifiedByUserId: userId,
      changeReason: reason || 'Template archived',
      createdAt: new Date()
    });

    await this.repository.save(template);

    await AuditLogModel.create({
      merchantId,
      userId,
      action: 'TEMPLATE_ARCHIVED',
      resource: 'evidence_templates',
      resourceId: (template._id || template.id)?.toString(),
      details: { version: template.version, name: template.name, reason }
    }).catch(() => {});

    return this.formatTemplate(template);
  }

  /**
   * Restores an archived template back to DISABLED (if previously approved) or PENDING_APPROVAL.
   */
  public async restoreTemplate(
    merchantId: string,
    templateId: string,
    userId?: string
  ): Promise<EvidenceTemplate> {
    const template = await this.repository.findById(merchantId, templateId);
    if (!template) {
      throw new Error('Template not found or access denied.');
    }

    if (template.status !== TemplateLifecycleStatus.ARCHIVED && !template.isArchived) {
      throw new Error('Template is not archived.');
    }

    const wasApproved = !!template.approvedAt || (template.history || []).some((h: any) => h.status === TemplateLifecycleStatus.APPROVED);
    template.status = wasApproved ? TemplateLifecycleStatus.DISABLED : TemplateLifecycleStatus.PENDING_APPROVAL;
    template.isActive = false;
    template.isArchived = false;
    template.archivedAt = undefined;

    template.history = template.history || [];
    template.history.push({
      version: template.version,
      regexPattern: template.regexPattern,
      fieldsMap: template.fieldsMap,
      status: template.status,
      isActive: false,
      modifiedByUserId: userId,
      changeReason: 'Template restored from archive',
      createdAt: new Date()
    });

    await this.repository.save(template);

    await AuditLogModel.create({
      merchantId,
      userId,
      action: 'TEMPLATE_RESTORED',
      resource: 'evidence_templates',
      resourceId: (template._id || template.id)?.toString(),
      details: { version: template.version, status: template.status }
    }).catch(() => {});

    return this.formatTemplate(template);
  }

  /**
   * Safely deletes a template if and only if no historical payment evidence has ever been extracted by it.
   * If evidence dependencies exist, permanently deleting is prohibited; archival must be used instead.
   */
  public async deleteTemplate(
    merchantId: string,
    templateId: string,
    userId?: string
  ): Promise<{ deleted: boolean; templateId: string }> {
    const template = await this.repository.findById(merchantId, templateId);
    if (!template) {
      throw new Error('Template not found or access denied.');
    }

    // Safety rule: If the template has been used to extract evidence, permanent delete is forbidden
    let hasDependencies = false;
    if (this.repository.hasEvidenceDependencies) {
      hasDependencies = await this.repository.hasEvidenceDependencies(merchantId, templateId);
    } else {
      const exists = await PaymentEvidenceModel.exists({
        merchantId,
        templateId: new mongoose.Types.ObjectId(templateId)
      });
      hasDependencies = !!exists;
    }

    if (hasDependencies) {
      throw new Error('CANNOT_DELETE_TEMPLATE_WITH_DEPENDENCIES: This template has extracted historical payment evidence and cannot be permanently deleted. Please archive it instead.');
    }

    if (this.repository.delete) {
      await this.repository.delete(merchantId, templateId);
    } else {
      await EvidenceTemplateModel.deleteOne({ _id: templateId, merchantId });
    }

    await AuditLogModel.create({
      merchantId,
      userId,
      action: 'TEMPLATE_DELETED',
      resource: 'evidence_templates',
      resourceId: templateId,
      details: { name: template.name, channel: template.channel }
    }).catch(() => {});

    return { deleted: true, templateId };
  }

  /**
   * Creates a new version (version n+1) from an existing template, setting it to PENDING_APPROVAL.
   */
  public async createTemplateVersion(
    merchantId: string,
    templateId: string,
    input: { regexPattern: string; fieldsMap?: Record<string, string>; samplePayload?: string; changeReason?: string },
    userId?: string
  ): Promise<EvidenceTemplate> {
    const template = await this.repository.findById(merchantId, templateId);
    if (!template) {
      throw new Error('Template not found or access denied.');
    }

    // Validate regex pattern syntax
    try {
      new RegExp(input.regexPattern, 'is');
    } catch (err: any) {
      throw new Error(`Invalid regex pattern: ${err.message}`);
    }

    // Archive current version into history
    template.history = template.history || [];
    template.history.push({
      version: template.version,
      regexPattern: template.regexPattern,
      fieldsMap: template.fieldsMap,
      status: template.status,
      isActive: template.isActive,
      modifiedByUserId: userId,
      changeReason: input.changeReason || `Upgraded to version ${template.version + 1}`,
      createdAt: new Date()
    });

    // Increment version and reset to PENDING_APPROVAL
    template.version += 1;
    template.status = TemplateLifecycleStatus.PENDING_APPROVAL;
    template.isActive = false;
    template.isImmutable = false;
    template.approvedByUserId = undefined;
    template.approvedAt = undefined;
    template.regexPattern = input.regexPattern;
    if (input.fieldsMap) {
      template.fieldsMap = { ...template.fieldsMap, ...input.fieldsMap };
    }
    if (input.samplePayload !== undefined) {
      template.samplePayload = input.samplePayload;
    }

    await this.repository.save(template);

    await AuditLogModel.create({
      merchantId,
      userId,
      action: 'TEMPLATE_VERSION_CREATED',
      resource: 'evidence_templates',
      resourceId: (template._id || template.id)?.toString(),
      details: { newVersion: template.version, reason: input.changeReason }
    }).catch(() => {});

    return this.formatTemplate(template);
  }

  /**
   * Retrieves version history and field diffs for a template.
   */
  public async getVersionHistory(merchantId: string, templateId: string): Promise<any[]> {
    const template = await this.repository.findById(merchantId, templateId);
    if (!template) {
      throw new Error('Template not found or access denied.');
    }

    const history = template.history || [];
    return history.map((entry: any, index: number) => {
      const prevEntry = index > 0 ? history[index - 1] : null;
      const patternChanged = prevEntry ? prevEntry.regexPattern !== entry.regexPattern : false;
      const fieldsChanged = prevEntry ? JSON.stringify(prevEntry.fieldsMap) !== JSON.stringify(entry.fieldsMap) : false;
      return {
        ...entry,
        patternChanged,
        fieldsChanged,
        isCurrent: entry.version === template.version
      };
    });
  }

  /**
   * Extracts structured labels from text (e.g. Union Bank, HDFC, ICICI, SBI, Axis, Kotak, Canara, PNB, or standard banking alerts)
   * Strictly ignores Available Balance ("Avl Bal Rs:...")
   */
  public static extractStructuredLabels(rawText: string): ExtractedTemplateFields {
    const result: ExtractedTemplateFields = {};
    if (!rawText) return result;

    const normalized = TemplateManager.normalizeNotificationText(rawText);

    // 1. Structured Amount
    // Matches prefix: "Amount: Rs. 1.00", "Credited for Rs:1.00", "Credited with INR 500", "Credited by Rs. 200", "Received Rs. 250", "Debited with Rs. 50"
    // Also matches suffix/infix: "INR 500.00 credited", "Rs. 1,000.00 credited to", "Rs 250 received"
    // Strictly ignores Available Balance ("Avl Bal", "Available Balance", "Total Bal")
    const prefixAmountRegex = /(?:Amount|Amt|Credited\s+(?:for|with|by)|Debited\s+(?:for|with|by)|Received)\s*(?:[:\s]+)?(?:INR|Rs\.?:?|₹)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i;
    const suffixAmountRegex = /(?:INR|Rs\.?:?|₹)\s*([0-9,]+(?:\.[0-9]{1,2})?)\s*(?:has been\s+)?(?:credited|deposited|received|debited)/i;

    const prefixMatch = normalized.match(prefixAmountRegex);
    const suffixMatch = normalized.match(suffixAmountRegex);
    const amountStr = prefixMatch?.[1] || suffixMatch?.[1];

    if (amountStr) {
      const cleanNum = parseFloat(amountStr.replace(/,/g, ''));
      if (!isNaN(cleanNum) && cleanNum > 0) {
        result.amountRupees = amountStr.replace(/,/g, '');
        result.amountPaise = Math.round(cleanNum * 100);
      }
    }

    // 2. Structured UTR / Reference
    // Supports "UPI Reference No: 123456789012", "ref no 123456789012", "UPI/123456789012/Payment",
    // "UPI/DR/668387168541/Payment", "thru UPI: 668387168541", "via UPI Ref 668387168541", "IMPS Ref: ...", "RRN: ..."
    const utrRegex = /(?:UPI\s*(?:Reference\s*|Ref\s*)?No\.?|Ref(?:\s*No\.?)?|Reference|RRN|IMPS\s*Ref|thru\s*UPI|via\s*UPI\s*Ref|UPI\/(?:[A-Z0-9]{2}\/)?)(?:[:\s/]+)?([a-zA-Z0-9]{10,22})/i;
    const utrMatch = normalized.match(utrRegex);
    if (utrMatch && utrMatch[1]) {
      result.utr = utrMatch[1].trim();
    }

    // 3. Structured Account
    // Supports "Account: XX0562", "A/c *0562", "A/c ending 1234", "A/c ending with 8765", "a/c no. XXXXXXXX1234", "Acct XX5678"
    const accountRegex = /(?:Account|A\/c|Acct|a\/c\s*no\.?)(?:\s*(?:ending\s*(?:with)?|no\.?|number))?[:\s]*([a-zA-Z0-9X*]+)/i;
    const accountMatch = normalized.match(accountRegex);
    if (accountMatch && accountMatch[1]) {
      const rawAcc = accountMatch[1].trim();
      const digits = rawAcc.replace(/\D/g, '');
      if (digits.length >= 2) {
        result.accountIdentifier = `XX${digits.slice(-4)}`;
      } else if (rawAcc.length >= 2 && !/^(?:ending|with|no|number)$/i.test(rawAcc)) {
        result.accountIdentifier = rawAcc;
      }
    }

    // 4. Structured Transaction Type (CREDIT vs DEBIT)
    const typeRegex = /(?:Transaction\s*Type|Type)[:\s]*(CREDIT|DEBIT)/i;
    const typeMatch = normalized.match(typeRegex);
    if (typeMatch && typeMatch[1]) {
      result.transactionType = typeMatch[1].toUpperCase() === 'DEBIT' ? TransactionType.DEBIT : TransactionType.CREDIT;
    } else if (/\b(debited|withdrawn|spent|transferred to|paid to)\b/i.test(normalized)) {
      result.transactionType = TransactionType.DEBIT;
    } else if (/\b(credited|received|deposited|refund)\b/i.test(normalized)) {
      result.transactionType = TransactionType.CREDIT;
    }

    // 5. Structured Date / Time labels
    // Supports DD-MM-YYYY, YYYY-MM-DD, DD/MM/YYYY and month names e.g. 18-Nov-2026, 18-November-2026
    const dateTimeRegex = /(?:(?:Transaction\s*Date|Date|on)[:\s]*)?([0-9]{1,2}[-/](?:[0-9]{1,2}|[a-zA-Z]{3,9})[-/][0-9]{2,4}|[0-9]{4}[-/][0-9]{2}[-/][0-9]{2})(?:\s+(?:(?:at|Time)[:\s]*)?([0-9]{2}:[0-9]{2}(?::[0-9]{2})?))?/i;
    const dtMatch = normalized.match(dateTimeRegex);
    if (dtMatch && dtMatch[1]) {
      const rawDate = dtMatch[1];
      const rawTime = dtMatch[2] || '00:00:00';
      let parsedDate: Date | null = null;

      const monthsMap: Record<string, string> = {
        jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
        jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
      };

      // Handle DD-Month-YYYY (e.g. 18-Nov-2026, 18-November-2026)
      const dmyMonth = rawDate.match(/^([0-9]{1,2})[-/]([a-zA-Z]{3,9})[-/]([0-9]{2,4})$/i);
      if (dmyMonth && dmyMonth[1] && dmyMonth[2] && dmyMonth[3]) {
        const day = dmyMonth[1].padStart(2, '0');
        const mKey = dmyMonth[2].toLowerCase().substring(0, 3);
        const monthNum = monthsMap[mKey] || '01';
        let year = dmyMonth[3];
        if (year.length === 2) year = `20${year}`;
        parsedDate = new Date(`${year}-${monthNum}-${day}T${rawTime}+05:30`);
      } else {
        // Handle DD-MM-YYYY or DD/MM/YYYY
        const dmy = rawDate.match(/^([0-9]{1,2})[-/]([0-9]{1,2})[-/]([0-9]{2,4})$/);
        if (dmy && dmy[1] && dmy[2] && dmy[3]) {
          const day = dmy[1].padStart(2, '0');
          const month = dmy[2].padStart(2, '0');
          let year = dmy[3];
          if (year.length === 2) year = `20${year}`;
          parsedDate = new Date(`${year}-${month}-${day}T${rawTime}+05:30`);
        } else {
          const attempt = new Date(`${rawDate} ${rawTime}`);
          if (!isNaN(attempt.getTime())) {
            parsedDate = attempt;
          }
        }
      }

      if (parsedDate && !isNaN(parsedDate.getTime())) {
        result.transactionTimestamp = parsedDate;
      }
    }

    return result;
  }

  /**
   * Extracts payment fields from a text notification using an approved active template.
   * Compiles regex with 'is' (dotAll + case-insensitive) to seamlessly match multiline templates.
   * Tolerates harmless formatting differences (whitespace variations, non-breaking spaces, CRLF linebreaks).
   */
  public static matchAndExtract(template: EvidenceTemplate, rawText: string): ExtractedTemplateFields | null {
    if (template.status !== TemplateLifecycleStatus.APPROVED) {
      return null;
    }
    if ((template as any).isActive === false || (template as any).isArchived === true) {
      return null;
    }

    let regex: RegExp;
    try {
      regex = new RegExp(template.regexPattern, 'is');
    } catch {
      return null;
    }

    const normalizedText = TemplateManager.normalizeNotificationText(rawText);

    // Try normalized text first, then raw text if normalized doesn't match
    let match = regex.exec(normalizedText);
    if (!match) {
      match = regex.exec(rawText);
    }
    if (!match) {
      return null;
    }

    const fieldsMap = template.fieldsMap || {};
    const result: ExtractedTemplateFields = {
      rawMatches: {}
    };

    const namedGroups = match.groups || {};

    const resolveField = (extractorKey?: string): string | undefined => {
      if (!extractorKey) return undefined;
      if (namedGroups[extractorKey]) return namedGroups[extractorKey];
      const index = parseInt(extractorKey, 10);
      if (!isNaN(index) && match[index] !== undefined) return match[index];
      return undefined;
    };

    const amountVal = resolveField(fieldsMap.amountPaiseExtractor);
    if (amountVal) {
      result.amountRupees = amountVal;
      const parsedNum = parseFloat(amountVal.replace(/,/g, ''));
      if (!isNaN(parsedNum)) {
        result.amountPaise = Math.round(parsedNum * 100);
      }
    }

    const utrVal = resolveField(fieldsMap.utrExtractor);
    if (utrVal) {
      result.utr = utrVal.trim();
    }

    const accountVal = resolveField(fieldsMap.accountExtractor);
    if (accountVal) {
      result.accountIdentifier = accountVal.trim();
    }

    const timestampVal = resolveField(fieldsMap.transactionTimestampExtractor);
    if (timestampVal) {
      const dmy = timestampVal.match(/^([0-9]{2})-([0-9]{2})-([0-9]{4})(?:\s+([0-9]{2}:[0-9]{2}(?::[0-9]{2})?))?$/);
      if (dmy) {
        const timePart = dmy[4] || '00:00:00';
        result.transactionTimestamp = new Date(`${dmy[3]}-${dmy[2]}-${dmy[1]}T${timePart}+05:30`);
      } else {
        const parsedDate = new Date(timestampVal);
        if (!isNaN(parsedDate.getTime())) {
          result.transactionTimestamp = parsedDate;
        }
      }
    }

    const transactionTypeVal = resolveField(fieldsMap.transactionTypeExtractor);
    if (transactionTypeVal) {
      result.transactionType = transactionTypeVal.trim().toUpperCase() === 'DEBIT'
        ? TransactionType.DEBIT
        : TransactionType.CREDIT;
    }

    // Enrich with structured label extractors for structured emails/alerts if missing from direct regex groups
    const structured = TemplateManager.extractStructuredLabels(rawText);
    if (!result.amountPaise && structured.amountPaise) {
      result.amountPaise = structured.amountPaise;
      result.amountRupees = structured.amountRupees;
    }
    if (!result.utr && structured.utr) {
      result.utr = structured.utr;
    }
    if (!result.accountIdentifier && structured.accountIdentifier) {
      result.accountIdentifier = structured.accountIdentifier;
    }
    if (!result.transactionTimestamp && structured.transactionTimestamp) {
      result.transactionTimestamp = structured.transactionTimestamp;
    }
    if (!result.transactionType && structured.transactionType) {
      result.transactionType = structured.transactionType;
    }

    return result;
  }

  /**
   * Resolves the most appropriate approved active template for an incoming notification.
   * Priority:
   * 1. Bank account specific templates (matching bankAccountId)
   * 2. Generic templates (where bankAccountId is not specified)
   */
  public static resolveTemplate(
    approvedTemplates: EvidenceTemplate[],
    packageName: string,
    senderHeader: string | undefined | null,
    rawText: string,
    bankAccountId?: string | null
  ): { matchedTemplate: EvidenceTemplate; extractedFields: ExtractedTemplateFields } | null {
    if (!approvedTemplates || approvedTemplates.length === 0) return null;

    // Filter out inactive or archived templates
    const activeApproved = approvedTemplates.filter(
      (t) => t.status === TemplateLifecycleStatus.APPROVED && (t as any).isActive !== false && !(t as any).isArchived
    );
    if (activeApproved.length === 0) return null;

    // Sort templates: Account-specific first, then generic
    const sorted = [...activeApproved].sort((a, b) => {
      const aMatchesBank = bankAccountId && a.bankAccountId && a.bankAccountId.toString() === bankAccountId.toString();
      const bMatchesBank = bankAccountId && b.bankAccountId && b.bankAccountId.toString() === bankAccountId.toString();
      if (aMatchesBank && !bMatchesBank) return -1;
      if (!aMatchesBank && bMatchesBank) return 1;
      if (a.bankAccountId && !b.bankAccountId) return -1;
      if (!a.bankAccountId && b.bankAccountId) return 1;
      return 0;
    });

    for (const tmpl of sorted) {
      // Check bank account constraint if template is bound to a different bank account
      if (tmpl.bankAccountId && bankAccountId && tmpl.bankAccountId.toString() !== bankAccountId.toString()) {
        continue;
      }

      const tmplSender = (tmpl.senderIdentifier || '').toLowerCase().trim();
      const tmplPkg = ((tmpl as any).packageName || '').toLowerCase().trim();
      const tmplHeader = ((tmpl as any).senderHeader || '').toLowerCase().trim();
      const pkgLower = (packageName || '').toLowerCase().trim();
      const headerLower = (senderHeader || '').toLowerCase().trim();

      // Check package name match if template has explicit packageName
      const packageMatches = !tmplPkg || tmplPkg === '*' || tmplPkg === pkgLower;

      // Check sender header match if template has explicit senderHeader
      const headerMatches = !tmplHeader || tmplHeader === '*' || Boolean(headerLower && (tmplHeader === headerLower || headerLower.includes(tmplHeader) || tmplHeader.includes(headerLower)));

      // If separate fields are present, both must match; otherwise fallback to unified senderIdentifier match
      let isIdentifierMatch = false;
      if (tmplPkg || tmplHeader) {
        isIdentifierMatch = packageMatches && headerMatches;
      } else {
        isIdentifierMatch = !tmplSender ||
          tmplSender === '*' ||
          tmplSender === pkgLower ||
          Boolean(headerLower && (tmplSender === headerLower || headerLower.includes(tmplSender) || tmplSender.includes(headerLower)));
      }

      if (isIdentifierMatch) {
        const extracted = TemplateManager.matchAndExtract(tmpl, rawText);
        if (extracted && (extracted.amountPaise || extracted.amountRupees)) {
          return { matchedTemplate: tmpl, extractedFields: extracted };
        }
      }
    }

    return null;
  }
}

export const defaultTemplateManager = new TemplateManager();
