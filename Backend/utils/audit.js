const { AuditLog, Notification } = require('../models');

async function writeAudit(req, action, resourceType, resourceId, metadata = {}) {
  await AuditLog.create({
    companyId: req.user.companyId || undefined,
    actorId: req.user.id,
    action,
    resourceType,
    resourceId,
    metadata,
    ipAddress: req.ip,
  });
}

async function notifyCompany(companyId, userId, type, title, message, resourceType, resourceId) {
  if (!userId) return;
  await Notification.create({
    companyId,
    userId,
    type,
    title,
    message,
    resourceType,
    resourceId,
  });
}

module.exports = { writeAudit, notifyCompany };
