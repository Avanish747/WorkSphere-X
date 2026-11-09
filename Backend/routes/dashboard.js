const express = require('express');
const mongoose = require('mongoose');
const { authenticate, authorize } = require('../middleware/auth');
const { tenantFilter } = require('../utils/tenant');
const { Employee, Attendance, Leave, Payroll, Application, Job, Department } = require('../models');

const router = express.Router();

router.get('/overview', authenticate, async (req, res) => {
  const tenant = tenantFilter(req.user, req.query.companyId);
  const today = new Date();
  const startOfDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const endOfDay = new Date(startOfDay);
  endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);
  const thisMonth = { periodYear: today.getUTCFullYear(), periodMonth: today.getUTCMonth() + 1 };
  const employeeFilter = { ...tenant, status: 'active' };
  const personal = req.user.role === 'employee' ? { _id: req.user.employeeId || null } : {};
  Object.assign(employeeFilter, personal);
  const attendanceFilter = {
    ...tenant,
    workDate: mongoose.trusted({ $gte: startOfDay, $lt: endOfDay }),
  };
  if (req.user.role === 'employee') attendanceFilter.employeeId = req.user.employeeId || null;

  const leaveFilter = {
    ...tenant,
    status: 'approved',
    startDate: mongoose.trusted({ $lt: endOfDay }),
    endDate: mongoose.trusted({ $gte: startOfDay }),
  };
  if (req.user.role === 'employee') leaveFilter.employeeId = req.user.employeeId || null;

  const [
    totalEmployees,
    activeEmployees,
    presentToday,
    lateToday,
    employeesOnLeave,
    monthlyPayroll,
    departmentDistribution,
    employeeGrowth,
    openJobs,
    applicationStages,
    pendingLeaves,
    approvedLeavesThisMonth,
    companiesCount,
  ] = await Promise.all([
    Employee.countDocuments({ ...tenant, ...personal }),
    Employee.countDocuments(employeeFilter),
    Attendance.countDocuments({
      ...attendanceFilter,
      status: mongoose.trusted({ $in: ['present', 'late', 'half_day'] }),
    }),
    Attendance.countDocuments({ ...attendanceFilter, status: 'late' }),
    Leave.countDocuments(leaveFilter),
    Payroll.aggregate([
      { $match: { ...tenant, ...thisMonth, status: { $in: ['approved', 'locked', 'paid'] } } },
      { $group: { _id: null, total: { $sum: '$netPay' } } },
    ]),
    Employee.aggregate([
      { $match: employeeFilter },
      { $lookup: { from: 'departments', localField: 'departmentId', foreignField: '_id', as: 'department' } },
      { $unwind: { path: '$department', preserveNullAndEmptyArrays: true } },
      { $group: { _id: { $ifNull: ['$department.name', 'Unassigned'] }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Employee.aggregate([
      { $match: { ...tenant, ...personal, joinDate: { $gte: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 5, 1)) } } },
      { $group: { _id: { year: { $year: '$joinDate' }, month: { $month: '$joinDate' } }, count: { $sum: 1 } } },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]),
    Job.countDocuments({ ...tenant, status: 'published' }),
    Application.aggregate([
      { $match: tenant },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Leave.countDocuments({ ...tenant, status: 'pending' }),
    Leave.countDocuments({
      ...tenant,
      status: 'approved',
      updatedAt: mongoose.trusted({ $gte: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)) }),
    }),
    req.user.role === 'super_admin' ? require('../models').Company.countDocuments({ status: 'active' }) : Promise.resolve(undefined),
  ]);

  const attendanceTotal = await Attendance.countDocuments(attendanceFilter);
  const absentToday = Math.max(activeEmployees - presentToday - employeesOnLeave, 0);
  const recruitment = Object.fromEntries(applicationStages.map((stage) => [stage._id, stage.count]));

  return res.json({
    stats: {
      totalEmployees,
      activeEmployees,
      presentToday,
      absentToday,
      lateToday,
      employeesOnLeave,
      monthlyPayroll: monthlyPayroll[0]?.total || 0,
      attendanceRate: activeEmployees ? Math.round((presentToday / activeEmployees) * 1000) / 10 : 0,
      attendanceRecordsToday: attendanceTotal,
      ...(companiesCount !== undefined && { activeCompanies: companiesCount }),
    },
    departmentDistribution: departmentDistribution.map((item) => ({ department: item._id, employees: item.count })),
    employeeGrowth: employeeGrowth.map((item) => ({ year: item._id.year, month: item._id.month, employees: item.count })),
    recruitment: { openJobs, applications: recruitment },
    leave: { pendingApprovals: pendingLeaves, approvedThisMonth: approvedLeavesThisMonth },
  });
});

router.get('/analytics', authenticate, authorize('super_admin', 'company_admin', 'hr_manager', 'finance_manager'), async (req, res) => {
  const filter = tenantFilter(req.user, req.query.companyId);
  const [employees, departments] = await Promise.all([
    Employee.countDocuments({ ...filter, status: 'active' }),
    Department.countDocuments({ ...filter, status: 'active' }),
  ]);
  return res.json({ activeEmployees: employees, departments });
});

module.exports = router;
