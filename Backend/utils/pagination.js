function parsePagination(query) {
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 20, 1), 100);
  const allowedSortFields = new Set([
    'createdAt', 'updatedAt', 'joinDate', 'firstName', 'lastName', 'employeeCode',
    'workDate', 'startDate', 'periodYear', 'periodMonth', 'title', 'name',
    'startsAt', 'amount', 'status',
  ]);
  const sortBy = allowedSortFields.has(query.sortBy) ? query.sortBy : 'createdAt';
  const sortOrder = query.sortOrder === 'asc' ? 1 : -1;

  return {
    page,
    limit,
    skip: (page - 1) * limit,
    sort: { [sortBy]: sortOrder },
  };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function paginatedResponse(data, total, page, limit) {
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}

module.exports = { parsePagination, paginatedResponse, escapeRegex };
