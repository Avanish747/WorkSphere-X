const mongoose = require('mongoose');

function tenantFilter(user, requestedCompanyId) {
  if (user.role === 'super_admin') {
    return requestedCompanyId ? { companyId: new mongoose.Types.ObjectId(requestedCompanyId) } : {};
  }

  return { companyId: new mongoose.Types.ObjectId(user.companyId) };
}

function assertTenantRelation(companyId, relation, label = 'Related record') {
  if (!relation || String(relation.companyId) !== String(companyId)) {
    const error = new Error(`${label} was not found in this workspace.`);
    error.statusCode = 404;
    throw error;
  }
}

module.exports = { tenantFilter, assertTenantRelation };
