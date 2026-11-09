const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');
const nodemailer = require('nodemailer');
const { z } = require('zod');
const { User, Company, Subscription } = require('../models');
const { authenticate, authorize, getSecrets } = require('../middleware/auth');
const { writeAudit } = require('../utils/audit');

const router = express.Router();
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
function refreshTokenMatches(storedHash, token) {
  if (typeof storedHash !== 'string' || !/^[a-f0-9]{64}$/i.test(storedHash)) return false;
  const expected = Buffer.from(storedHash, 'hex');
  const actual = Buffer.from(hashToken(token), 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}
const mailTransport = process.env.SMTP_HOST
  ? nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
  })
  : null;

async function sendMail(to, subject, text) {
  if (!mailTransport) return false;
  await mailTransport.sendMail({
    from: process.env.MAIL_FROM || 'WorkSphere X <no-reply@workspherex.local>',
    to,
    subject,
    text,
  });
  return true;
}

function createOneTimeToken() {
  const raw = crypto.randomBytes(32).toString('hex');
  return { raw, hash: hashToken(raw) };
}

const loginSchema = z.object({
  email: z.string().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
});

const registrationSchema = z.object({
  companyName: z.string().trim().min(2).max(120),
  fullName: z.string().trim().min(2).max(120),
  email: z.string().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string()
    .min(12)
    .max(128)
    .regex(/[a-z]/, 'Password must include a lowercase letter.')
    .regex(/[A-Z]/, 'Password must include an uppercase letter.')
    .regex(/\d/, 'Password must include a number.')
    .regex(/[^A-Za-z0-9]/, 'Password must include a symbol.'),
});

function issueTokens(user) {
  const secrets = getSecrets();
  const accessToken = jwt.sign(
    { sub: String(user._id), typ: 'access' },
    secrets.access,
    { expiresIn: '15m', issuer: 'worksphere-x' },
  );
  const refreshToken = jwt.sign(
    { sub: String(user._id), typ: 'refresh', jti: crypto.randomUUID() },
    secrets.refresh,
    { expiresIn: '7d', issuer: 'worksphere-x' },
  );
  return { accessToken, refreshToken };
}

function setRefreshCookie(res, token) {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function clearRefreshCookie(res) {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/auth',
  });
}

function publicUser(user) {
  return {
    id: String(user._id),
    companyId: user.companyId ? String(user.companyId) : null,
    employeeId: user.employeeId ? String(user.employeeId) : null,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    permissions: user.permissions,
    status: user.status,
  };
}

router.post('/register-company', async (req, res) => {
  const input = registrationSchema.parse(req.body);
  const emailExists = await User.exists({ email: input.email });
  if (emailExists) return res.status(409).json({ message: 'This email is already registered.' });

  const slugBase = input.companyName
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
  const company = await Company.create({
    name: input.companyName,
    slug: `${slugBase}-${crypto.randomBytes(3).toString('hex')}`,
    email: input.email,
  });

  let user;
  let tokens;
  const verificationToken = createOneTimeToken();
  try {
    user = await User.create({
      companyId: company._id,
      fullName: input.fullName,
      email: input.email,
      passwordHash: input.password,
      role: 'company_admin',
      status: 'active',
      emailVerificationHash: verificationToken.hash,
      emailVerificationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    await Subscription.create({ companyId: company._id });

    req.user = { id: String(user._id), companyId: String(company._id) };
    tokens = issueTokens(user);
    user.refreshTokenHash = hashToken(tokens.refreshToken);
    user.refreshTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await user.save();

  } catch (error) {
    if (user) await User.deleteOne({ _id: user._id });
    await Company.deleteOne({ _id: company._id });
    throw error;
  }

  req.user = { id: String(user._id), companyId: String(company._id) };
  await writeAudit(req, 'company.registered', 'Company', company._id);
  const emailSent = await sendMail(
    user.email,
    'Verify your WorkSphere X email',
    `Your email verification token is ${verificationToken.raw}. It expires in 24 hours.`,
  );
  if (!emailSent) console.warn('SMTP_HOST is not configured; email verification cannot be delivered.');
  setRefreshCookie(res, tokens.refreshToken);
  return res.status(201).json({
    message: 'Company registered successfully.',
    user: publicUser(user),
    company: { id: String(company._id), name: company.name, slug: company.slug },
    accessToken: tokens.accessToken,
  });
});

router.post('/verify-email', async (req, res) => {
  const input = z.object({ token: z.string().min(20).max(200) }).parse(req.body);
  const user = await User.findOne({
    emailVerificationHash: hashToken(input.token),
    emailVerificationExpiresAt: { $gt: new Date() },
  }).select('+emailVerificationHash +emailVerificationExpiresAt');
  if (!user) return res.status(400).json({ message: 'Verification token is invalid or expired.' });
  user.emailVerifiedAt = new Date();
  user.emailVerificationHash = undefined;
  user.emailVerificationExpiresAt = undefined;
  await user.save();
  await writeAudit({ ...req, user: { id: String(user._id), companyId: String(user.companyId) } }, 'user.email_verified', 'User', user._id);
  return res.json({ message: 'Email verified successfully.' });
});

router.post('/forgot-password', async (req, res) => {
  const input = z.object({ email: z.string().email().max(254) }).parse(req.body);
  const user = await User.findOne({ email: input.email.toLowerCase() });
  const response = { message: 'If that account exists, password reset instructions have been sent.' };
  if (!user) return res.json(response);

  const reset = createOneTimeToken();
  user.passwordResetHash = reset.hash;
  user.passwordResetExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
  await user.save();
  const emailSent = await sendMail(
    user.email,
    'Reset your WorkSphere X password',
    `Use this one-time token to reset your password: ${reset.raw}. It expires in 30 minutes.`,
  );
  if (!emailSent) {
    console.warn('SMTP_HOST is not configured; password reset cannot be delivered.');
    if (process.env.NODE_ENV !== 'production') response.resetToken = reset.raw;
  }
  return res.json(response);
});

router.post('/reset-password', async (req, res) => {
  const input = z.object({
    token: z.string().min(20).max(200),
    password: registrationSchema.shape.password,
  }).parse(req.body);
  const user = await User.findOne({
    passwordResetHash: hashToken(input.token),
    passwordResetExpiresAt: { $gt: new Date() },
  }).select('+passwordResetHash +passwordResetExpiresAt +refreshTokenHash +refreshTokenExpiresAt');
  if (!user) return res.status(400).json({ message: 'Password reset token is invalid or expired.' });
  user.passwordHash = input.password;
  user.passwordChangedAt = new Date();
  user.passwordResetHash = undefined;
  user.passwordResetExpiresAt = undefined;
  user.refreshTokenHash = undefined;
  user.refreshTokenExpiresAt = undefined;
  await user.save();
  await writeAudit({ ...req, user: { id: String(user._id), companyId: user.companyId ? String(user.companyId) : null } }, 'user.password_reset', 'User', user._id);
  return res.json({ message: 'Password updated. Sign in with your new password.' });
});

router.post('/login', async (req, res) => {
  const input = loginSchema.parse(req.body);
  const user = await User.findOne({ email: input.email })
    .select('+passwordHash +failedLoginAttempts +lockUntil +refreshTokenHash');

  if (!user || (user.lockUntil && user.lockUntil > new Date())) {
    return res.status(user ? 423 : 401).json({ message: user ? 'Account temporarily locked.' : 'Invalid credentials.' });
  }

  if (!(await user.verifyPassword(input.password))) {
    user.failedLoginAttempts += 1;
    if (user.failedLoginAttempts >= 5) user.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();
    return res.status(user.lockUntil ? 423 : 401).json({ message: 'Invalid credentials.' });
  }

  if (user.status !== 'active') {
    return res.status(403).json({ message: 'This account is suspended or inactive.' });
  }
  if (user.companyId) {
    const company = await Company.findById(user.companyId).select('status');
    if (!company || company.status === 'suspended') {
      return res.status(403).json({ message: 'Company workspace is suspended.' });
    }
  }

  user.failedLoginAttempts = 0;
  user.lockUntil = undefined;
  user.lastLoginAt = new Date();
  const tokens = issueTokens(user);
  user.refreshTokenHash = hashToken(tokens.refreshToken);
  user.refreshTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await user.save();

  setRefreshCookie(res, tokens.refreshToken);
  const company = user.companyId
    ? await Company.findById(user.companyId).select('name slug status settings')
    : null;

  return res.json({
    message: 'Login successful.',
    accessToken: tokens.accessToken,
    user: publicUser(user),
    company,
  });
});

router.post('/refresh', async (req, res) => {
  const refreshToken = req.cookies?.refreshToken;
  if (!refreshToken) return res.status(401).json({ message: 'Refresh token missing.' });

  let payload;
  try {
    payload = jwt.verify(refreshToken, getSecrets().refresh, { issuer: 'worksphere-x' });
  } catch (error) {
    clearRefreshCookie(res);
    return res.status(401).json({ message: 'Refresh token invalid or expired.' });
  }

  if (payload.typ !== 'refresh') {
    clearRefreshCookie(res);
    return res.status(401).json({ message: 'Invalid token type.' });
  }
  const user = await User.findById(payload.sub).select('+refreshTokenHash +refreshTokenExpiresAt');
  if (
    !user
    || !user.refreshTokenHash
    || !user.refreshTokenExpiresAt
    || user.refreshTokenExpiresAt <= new Date()
    || !refreshTokenMatches(user.refreshTokenHash, refreshToken)
    || user.status !== 'active'
  ) {
    clearRefreshCookie(res);
    return res.status(401).json({ message: 'Refresh token has been revoked or expired.' });
  }

  if (user.role !== 'super_admin' && user.companyId) {
    const company = await Company.findById(user.companyId).select('status');
    if (!company || company.status === 'suspended') {
      clearRefreshCookie(res);
      return res.status(403).json({ message: 'Company workspace is suspended.' });
    }
  }

  const tokens = issueTokens(user);
  user.refreshTokenHash = hashToken(tokens.refreshToken);
  user.refreshTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await user.save();
  setRefreshCookie(res, tokens.refreshToken);
  return res.json({ accessToken: tokens.accessToken, user: publicUser(user) });
});

router.post('/logout', async (req, res) => {
  const refreshToken = req.cookies?.refreshToken;
  if (refreshToken) {
    try {
      const payload = jwt.verify(refreshToken, getSecrets().refresh, { issuer: 'worksphere-x' });
      await User.updateOne(
        { _id: payload.sub, refreshTokenHash: hashToken(refreshToken) },
        { $unset: { refreshTokenHash: 1, refreshTokenExpiresAt: 1 } },
      );
    } catch (error) {
      if (error.name !== 'JsonWebTokenError' && error.name !== 'TokenExpiredError') throw error;
    }
  }
  clearRefreshCookie(res);
  return res.json({ message: 'Logged out successfully.' });
});

router.get('/me', authenticate, async (req, res) => {
  const user = await User.findById(req.user.id).select('companyId');
  const company = user?.companyId
    ? await Company.findById(user.companyId).select('name slug status settings')
    : null;
  return res.json({ user: req.user, company });
});

router.get('/admin-only', authenticate, authorize('super_admin'), (req, res) => {
  res.json({ message: 'You are authorized as a platform admin.' });
});

module.exports = router;
