const jwt = require('jsonwebtoken');
const { User, Company } = require('../models');

function getSecrets() {
  if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET)) {
    throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must be configured in production.');
  }

  return {
    access: process.env.JWT_SECRET || 'local-development-access-secret',
    refresh: process.env.JWT_REFRESH_SECRET || 'local-development-refresh-secret',
  };
}

async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  const token = (header && header.startsWith('Bearer ') ? header.slice(7) : null)
    || req.cookies?.accessToken;

  if (!token) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  try {
    const payload = jwt.verify(token, getSecrets().access, { issuer: 'worksphere-x' });
    if (payload.typ !== 'access') {
      return res.status(401).json({ message: 'Invalid token type.' });
    }
    const user = await User.findById(payload.sub)
      .select('companyId employeeId fullName email role status permissions');

    if (!user || user.status !== 'active') {
      return res.status(401).json({ message: 'Account is unavailable.' });
    }

    if (user.role !== 'super_admin' && user.companyId) {
      const company = await Company.findById(user.companyId).select('status');
      if (!company || company.status === 'suspended') {
        return res.status(403).json({ message: 'Company workspace is suspended.' });
      }
    }

    req.user = {
      id: String(user._id),
      companyId: user.companyId ? String(user.companyId) : null,
      employeeId: user.employeeId ? String(user.employeeId) : null,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      permissions: user.permissions,
    };

    return next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Invalid or expired access token.' });
    }

    return next(error);
  }
}

function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have access to this resource.' });
    }

    return next();
  };
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (req.user?.role === 'super_admin' || req.user?.permissions?.includes(permission)) {
      return next();
    }
    return res.status(403).json({ message: `Missing permission: ${permission}` });
  };
}

function requireTenantAccess(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  const requestedCompanyId = req.params.companyId || req.body?.companyId || req.query.companyId;
  if (req.user.role !== 'super_admin' && requestedCompanyId && requestedCompanyId !== req.user.companyId) {
    return res.status(403).json({ message: 'Tenant isolation violation. Access denied.' });
  }

  return next();
}

module.exports = { authenticate, authorize, requirePermission, requireTenantAccess, getSecrets };
