import { useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  ArrowDownToLine, ArrowUpDown, Check, ChevronLeft, ChevronRight, CircleAlert,
  FileText, LoaderCircle, Pencil, Plus, Search, Trash2, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

const card = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-soft';
const button = 'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50';
const primary = `${button} bg-slate-900 text-white hover:bg-slate-700`;
const subtle = `${button} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`;
const input = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const selectClass = input;

export function useRemote(url, refreshKey = 0, enabled = true) {
  const [state, setState] = useState({ data: null, loading: Boolean(enabled), error: null });
  useEffect(() => {
    let active = true;
    if (!enabled) {
      setState({ data: null, loading: false, error: null });
      return () => { active = false; };
    }
    setState((current) => ({ ...current, loading: true, error: null }));
    api.get(url).then(({ data }) => {
      if (active) setState({ data, loading: false, error: null });
    }).catch((error) => {
      if (active) setState({ data: null, loading: false, error: error.response?.data?.message || 'Unable to load this data.' });
    });
    return () => { active = false; };
  }, [url, refreshKey, enabled]);
  return state;
}

export function PageHeader({ eyebrow, title, description, children }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">{eyebrow}</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{title}</h2>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function Panel({ title, action, children, className = '' }) {
  return (
    <section className={`${card} ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h3 className="font-bold text-slate-900">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function LoadState({ loading, error, empty, onRetry, children }) {
  if (loading) {
    return <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-slate-500"><LoaderCircle className="animate-spin" size={18} /> Loading workspace data…</div>;
  }
  if (error) {
    return <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><div className="flex items-start gap-2"><CircleAlert size={18} className="mt-0.5 shrink-0" /><div className="flex-1">{error}</div><button onClick={onRetry} className="font-semibold underline">Retry</button></div></div>;
  }
  if (empty) return <div className="py-12 text-center text-sm text-slate-500">{empty}</div>;
  return children;
}

export function DataTable({ columns, rows, rowKey = '_id', empty = 'No records yet.' }) {
  if (!rows?.length) return <div className="rounded-xl border border-dashed border-slate-300 py-12 text-center text-sm text-slate-500">{empty}</div>;
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>{columns.map((column) => <th key={column.key} className="whitespace-nowrap px-4 py-3">{column.label}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, index) => (
            <tr key={row[rowKey] || index} className="hover:bg-slate-50/70">
              {columns.map((column) => <td key={column.key} className="whitespace-nowrap px-4 py-3 text-slate-700">{column.render ? column.render(row) : (row[column.key] ?? '—')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ pagination, page, setPage }) {
  if (!pagination || pagination.pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
      <span>{pagination.total} records · page {page} of {pagination.pages}</span>
      <div className="flex gap-2">
        <button className={subtle} disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft size={16} /></button>
        <button className={subtle} disabled={page >= pagination.pages} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight size={16} /></button>
      </div>
    </div>
  );
}

export function Modal({ title, onClose, children }) {
  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <button className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" onClick={onClose} aria-label="Close dialog"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function DashboardPage({ user }) {
  const { data, loading, error } = useRemote('/dashboard/overview');
  const stats = data?.stats;
  const departmentDistribution = data?.departmentDistribution || [];
  const employeeGrowth = data?.employeeGrowth || [];
  const applications = Object.entries(data?.recruitment?.applications || {}).map(([stage, count]) => ({ stage, count }));
  const isSuperAdmin = user?.role === 'super_admin';
  const cards = [
    ...(isSuperAdmin ? [['Active companies', stats?.activeCompanies]] : []),
    ['Active employees', stats?.activeEmployees],
    ['Present today', stats?.presentToday],
    ['On leave today', stats?.employeesOnLeave],
    ['Monthly payroll', stats?.monthlyPayroll == null ? null : new Intl.NumberFormat(undefined, { style: 'currency', currency: data?.company?.settings?.currency || 'USD', maximumFractionDigits: 0 }).format(stats.monthlyPayroll)],
  ];
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={isSuperAdmin ? 'Platform administration' : 'Live workforce analytics'}
        title={isSuperAdmin ? 'Platform overview' : 'Company overview'}
        description={isSuperAdmin ? 'Platform-wide activity across active company workspaces.' : 'Current tenant data from your WorkSphere X workspace.'}
      />
      {error && <div className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value]) => (
          <div className={card} key={label}>
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-3 text-3xl font-bold text-slate-900">{loading ? '—' : value ?? 0}</p>
            <p className="mt-2 text-xs text-slate-400">Live backend metric</p>
          </div>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Department distribution">
          {loading ? <LoadState loading /> : departmentDistribution.length ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={departmentDistribution} margin={{ left: 0, right: 12, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="department" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="employees" fill="#2563eb" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <LoadState empty="No department data available yet." />}
        </Panel>
        <Panel title="Employee growth">
          {loading ? <LoadState loading /> : employeeGrowth.length ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={employeeGrowth} margin={{ left: 0, right: 12, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tickFormatter={(month) => new Date(2000, month - 1).toLocaleString(undefined, { month: 'short' })} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="employees" fill="#14b8a6" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <LoadState empty="No employees have joined in the selected period." />}
        </Panel>
        <Panel title="Recruitment pipeline">
          {loading ? <LoadState loading /> : applications.length ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={applications} dataKey="count" nameKey="stage" outerRadius={90} label>
                    {applications.map((entry, index) => <Cell key={entry.stage} fill={['#2563eb', '#14b8a6', '#8b5cf6', '#f59e0b', '#ef4444'][index % 5]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : <LoadState empty="No recruitment applications have been entered yet." />}
        </Panel>
        <Panel title="Leave & recruitment activity">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Open roles</p><p className="mt-1 text-2xl font-bold">{loading ? '—' : data?.recruitment?.openJobs || 0}</p></div>
            <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Pending leave approvals</p><p className="mt-1 text-2xl font-bold">{loading ? '—' : data?.leave?.pendingApprovals || 0}</p></div>
            <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Absent today</p><p className="mt-1 text-2xl font-bold">{loading ? '—' : stats?.absentToday || 0}</p></div>
            <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Attendance rate</p><p className="mt-1 text-2xl font-bold">{loading ? '—' : `${stats?.attendanceRate || 0}%`}</p></div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

const employeeFormSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required.').max(80),
  lastName: z.string().trim().min(1, 'Last name is required.').max(80),
  email: z.string().email('Enter a valid email address.'),
  phone: z.string().max(32).optional(),
  departmentId: z.string().optional(),
  designationId: z.string().optional(),
  managerId: z.string().optional(),
  joinDate: z.string().min(1, 'Joining date is required.'),
  employmentType: z.enum(['full_time', 'part_time', 'contract', 'intern']),
});

export function EmployeesPage({ canManage }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [editing, setEditing] = useState(null);
  const [profile, setProfile] = useState(null);
  const [values, setValues] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const params = new URLSearchParams({ page, limit: 20, sortBy: 'lastName', sortOrder: 'asc' });
  if (search) params.set('q', search);
  if (status) params.set('status', status);
  const { data, loading, error } = useRemote(`/employees?${params}`, refresh);
  const { data: departments = [] } = useRemote('/departments?limit=100', refresh);
  const { data: designations = [] } = useRemote('/designations?limit=100', refresh);
  const rows = data?.data || [];
  const pagination = data?.pagination;

  const openForm = (employee = null) => {
    setEditing(employee || {});
    setFormError('');
    setValues(employee ? {
      firstName: employee.firstName,
      lastName: employee.lastName,
      email: employee.email,
      phone: employee.phone || '',
      joinDate: employee.joinDate?.slice(0, 10),
      employmentType: employee.employmentType || 'full_time',
      departmentId: employee.departmentId?._id || employee.departmentId || '',
      designationId: employee.designationId?._id || employee.designationId || '',
      managerId: employee.managerId?._id || employee.managerId || '',
    } : { employmentType: 'full_time', joinDate: new Date().toISOString().slice(0, 10) });
  };
  const closeForm = () => setEditing(null);
  const updateValue = (key, value) => setValues((current) => ({ ...current, [key]: value }));

  const saveEmployee = async (event) => {
    event.preventDefault();
    setFormError('');
    const parsed = employeeFormSchema.safeParse(values);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message || 'Check the employee details.');
      return;
    }
    setBusy(true);
    try {
      const payload = { ...parsed.data };
      for (const key of ['departmentId', 'designationId', 'managerId']) if (!payload[key]) delete payload[key];
      if (editing?._id) await api.put(`/employees/${editing._id}`, payload);
      else await api.post('/employees', payload);
      toast.success(editing?._id ? 'Employee updated.' : 'Employee added.');
      closeForm();
      setRefresh((current) => current + 1);
    } catch (requestError) {
      setFormError(requestError.response?.data?.message || 'Could not save this employee.');
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async (employee) => {
    if (!window.confirm(`Deactivate ${employee.firstName} ${employee.lastName}? Their records will be retained.`)) return;
    try {
      await api.patch(`/employees/${employee._id}/deactivate`);
      toast.success('Employee deactivated.');
      setRefresh((current) => current + 1);
    } catch (requestError) {
      toast.error(requestError.response?.data?.message || 'Unable to deactivate employee.');
    }
  };

  const exportCsv = async () => {
    try {
      const { data: blob } = await api.get('/employees/export.csv', { responseType: 'blob' });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = 'employees.csv';
      anchor.click();
      URL.revokeObjectURL(href);
    } catch (requestError) {
      toast.error(requestError.response?.data?.message || 'CSV export failed.');
    }
  };

  const viewProfile = async (employee) => {
    setProfile({ loading: true, employee });
    try {
      const { data: result } = await api.get(`/employees/${employee._id}/profile`);
      setProfile({ loading: false, ...result });
    } catch (requestError) {
      setProfile({ loading: false, error: requestError.response?.data?.message || 'Unable to load employee profile.' });
    }
  };

  const columns = [
    { key: 'name', label: 'Employee', render: (row) => <button className="font-semibold text-blue-700 hover:underline" onClick={() => viewProfile(row)}>{row.firstName} {row.lastName}<span className="block text-xs font-normal text-slate-400">{row.employeeCode}</span></button> },
    { key: 'departmentId', label: 'Department', render: (row) => row.departmentId?.name || 'Unassigned' },
    { key: 'designationId', label: 'Designation', render: (row) => row.designationId?.title || '—' },
    { key: 'email', label: 'Email' },
    { key: 'joinDate', label: 'Joined', render: (row) => row.joinDate?.slice(0, 10) },
    { key: 'status', label: 'Status', render: (row) => <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold capitalize text-emerald-700">{row.status}</span> },
    ...(canManage ? [{ key: 'actions', label: 'Actions', render: (row) => <div className="flex gap-1"><button className="rounded-lg p-2 hover:bg-slate-100" onClick={() => openForm(row)} title="Edit"><Pencil size={15} /></button><button className="rounded-lg p-2 text-rose-600 hover:bg-rose-50" onClick={() => deactivate(row)} title="Deactivate"><Trash2 size={15} /></button></div> }] : []),
  ];

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="People operations" title="Employees" description="Search, filter, export, and maintain tenant employee records.">
        <button className={subtle} onClick={exportCsv}><ArrowDownToLine size={16} /> Export CSV</button>
        {canManage && <button className={primary} onClick={() => openForm()}><Plus size={16} /> Add employee</button>}
      </PageHeader>
      <Panel>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <label className="relative flex-1"><Search className="absolute left-3 top-3 text-slate-400" size={16} /><input className={`${input} pl-9`} placeholder="Search name, email or employee ID" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>
          <select className={`${selectClass} sm:w-48`} value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="on_leave">On leave</option><option value="terminated">Terminated</option></select>
        </div>
        <LoadState loading={loading} error={error} onRetry={() => setRefresh((n) => n + 1)} empty={rows.length ? null : 'No employees match your filters. Add an employee to get started.'}>
          <DataTable columns={columns} rows={rows} />
          <Pagination pagination={pagination} page={page} setPage={setPage} />
        </LoadState>
      </Panel>
      {editing && (
        <Modal title={editing._id ? 'Edit employee' : 'Add employee'} onClose={closeForm}>
          <form className="space-y-4" onSubmit={saveEmployee}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="First name" required value={values.firstName || ''} onChange={(value) => updateValue('firstName', value)} />
              <Field label="Last name" required value={values.lastName || ''} onChange={(value) => updateValue('lastName', value)} />
              <Field label="Work email" type="email" required value={values.email || ''} onChange={(value) => updateValue('email', value)} />
              <Field label="Phone" value={values.phone || ''} onChange={(value) => updateValue('phone', value)} />
              <label className="block text-sm font-medium text-slate-700">Joining date<input type="date" required className={`${input} mt-1`} value={values.joinDate || ''} onChange={(event) => updateValue('joinDate', event.target.value)} /></label>
              <label className="block text-sm font-medium text-slate-700">Employment type<select className={`${selectClass} mt-1`} value={values.employmentType || 'full_time'} onChange={(event) => updateValue('employmentType', event.target.value)}><option value="full_time">Full-time</option><option value="part_time">Part-time</option><option value="contract">Contract</option><option value="intern">Intern</option></select></label>
              <OptionField label="Department" value={values.departmentId || ''} onChange={(value) => updateValue('departmentId', value)} options={departments} optionLabel="name" />
              <OptionField label="Designation" value={values.designationId || ''} onChange={(value) => updateValue('designationId', value)} options={designations} optionLabel="title" />
            </div>
            <p className="text-xs text-slate-500">Reporting manager may be assigned after employee records are created.</p>
            {formError && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{formError}</p>}
            <div className="flex justify-end gap-2"><button type="button" className={subtle} onClick={closeForm}>Cancel</button><button className={primary} disabled={busy}>{busy ? 'Saving…' : 'Save employee'}</button></div>
          </form>
        </Modal>
      )}
      {profile && (
        <Modal title="Employee profile" onClose={() => setProfile(null)}>
          <LoadState loading={profile.loading} error={profile.error} empty={null}>
            {profile.employee && <div className="space-y-5">
              <div><h3 className="text-xl font-bold">{profile.employee.firstName} {profile.employee.lastName}</h3><p className="text-sm text-slate-500">{profile.employee.employeeCode} · {profile.employee.email}</p></div>
              <div className="grid gap-3 sm:grid-cols-2"><Info label="Department" value={profile.employee.departmentId?.name} /><Info label="Designation" value={profile.employee.designationId?.title} /><Info label="Manager" value={`${profile.employee.managerId?.firstName || ''} ${profile.employee.managerId?.lastName || ''}`} /><Info label="Joined" value={profile.employee.joinDate?.slice(0, 10)} /></div>
              <Panel title="Recent attendance"><DataTable columns={[{ key: 'workDate', label: 'Date', render: (row) => row.workDate?.slice(0, 10) }, { key: 'status', label: 'Status' }, { key: 'workedMinutes', label: 'Hours', render: (row) => `${(row.workedMinutes / 60).toFixed(1)} h` }]} rows={profile.attendance} empty="No attendance history." /></Panel>
              <Panel title="Employee documents"><DataTable columns={[{ key: 'name', label: 'Document' }, { key: 'category', label: 'Type' }, { key: 'status', label: 'Review' }, { key: 'download', label: '', render: (row) => <button className="text-blue-700" onClick={() => downloadDocument(row._id)}><ArrowDownToLine size={16} /></button> }]} rows={profile.documents} empty="No employee documents." /></Panel>
            </div>}
          </LoadState>
        </Modal>
      )}
    </div>
  );
}

function Field({ label, type = 'text', value, onChange, required, placeholder }) {
  return <label className="block text-sm font-medium text-slate-700">{label}<input className={`${input} mt-1`} type={type} required={required} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>;
}

function OptionField({ label, value, onChange, options, optionLabel }) {
  return <label className="block text-sm font-medium text-slate-700">{label}<select className={`${selectClass} mt-1`} value={value} onChange={(event) => onChange(event.target.value)}><option value="">Unassigned</option>{options.map((option) => <option value={option._id} key={option._id}>{option[optionLabel]}</option>)}</select></label>;
}

function Info({ label, value }) {
  return <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-sm font-medium">{value || '—'}</p></div>;
}

async function downloadDocument(id) {
  try {
    const { data } = await api.get(`/documents/${id}/download`, { responseType: 'blob' });
    const href = URL.createObjectURL(data);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = `document-${id}`;
    anchor.click();
    URL.revokeObjectURL(href);
  } catch (error) {
    toast.error(error.response?.data?.message || 'Unable to download this document.');
  }
}

export function AttendancePage({ user }) {
  const [refresh, setRefresh] = useState(0);
  const [employeeId, setEmployeeId] = useState(user.employeeId || '');
  const [employeeError, setEmployeeError] = useState('');
  const [busy, setBusy] = useState(false);
  const now = new Date();
  const { data: employeePage } = useRemote('/employees?limit=100&status=active', refresh, user.role !== 'employee');
  const employees = employeePage?.data || [];
  useEffect(() => {
    if (!employeeId && employees[0]) setEmployeeId(employees[0]._id);
  }, [employeeId, employees]);
  const { data, loading, error } = useRemote(`/attendance/history?limit=50&sortBy=workDate&sortOrder=desc`, refresh);
  const { data: calendar, loading: calendarLoading } = useRemote(`/attendance/calendar?year=${now.getFullYear()}&month=${now.getMonth() + 1}`, refresh);
  const records = data?.data || [];
  const todayKey = new Date().toISOString().slice(0, 10);
  const openAttendance = records.find((record) => record.employeeId?._id === employeeId && record.workDate?.slice(0, 10) === todayKey && !record.checkOutAt);

  const attendanceAction = async (action) => {
    if (!employeeId) return setEmployeeError('Select an employee before recording attendance.');
    setEmployeeError('');
    setBusy(true);
    try {
      await api.post(`/attendance/${action}`, { employeeId });
      toast.success(action === 'check-in' ? 'Check-in recorded.' : 'Check-out recorded.');
      setRefresh((key) => key + 1);
    } catch (requestError) {
      toast.error(requestError.response?.data?.message || 'Attendance could not be recorded.');
    } finally {
      setBusy(false);
    }
  };
  const columns = [
    { key: 'employeeId', label: 'Employee', render: (row) => row.employeeId ? `${row.employeeId.firstName} ${row.employeeId.lastName}` : '—' },
    { key: 'workDate', label: 'Date', render: (row) => row.workDate?.slice(0, 10) },
    { key: 'checkInAt', label: 'Check in', render: (row) => row.checkInAt ? new Date(row.checkInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—' },
    { key: 'checkOutAt', label: 'Check out', render: (row) => row.checkOutAt ? new Date(row.checkOutAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Open' },
    { key: 'workedMinutes', label: 'Hours', render: (row) => `${(row.workedMinutes / 60).toFixed(1)} h` },
    { key: 'lateMinutes', label: 'Late', render: (row) => `${row.lateMinutes || 0} min` },
    { key: 'overtimeMinutes', label: 'Overtime', render: (row) => `${row.overtimeMinutes || 0} min` },
    { key: 'status', label: 'Status' },
  ];
  const calendarDays = useMemo(() => {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return Array.from({ length: last.getDate() }, (_, index) => {
      const day = index + 1;
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const record = calendar?.attendance?.find((item) => item.workDate?.slice(0, 10) === date);
      return { day, date, record };
    });
  }, [calendar, now]);

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Time & presence" title="Attendance" description="Check-ins, working hours, overtime, and monthly history." />
      <Panel title="Record attendance">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          {user.role !== 'employee' && <label className="block flex-1 text-sm font-medium text-slate-700">Employee<select className={`${selectClass} mt-1`} value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}><option value="">Select employee</option>{employees.map((employee) => <option key={employee._id} value={employee._id}>{employee.firstName} {employee.lastName} · {employee.employeeCode}</option>)}</select></label>}
          <button className={`${primary} bg-emerald-600 hover:bg-emerald-700`} disabled={busy || Boolean(openAttendance)} onClick={() => attendanceAction('check-in')}><Check size={16} />{busy ? 'Saving…' : 'Check in'}</button>
          <button className={subtle} disabled={busy || !openAttendance} onClick={() => attendanceAction('check-out')}>Check out</button>
        </div>
        {employeeError && <p className="mt-2 text-sm text-rose-700">{employeeError}</p>}
        <p className="mt-3 text-xs text-slate-500">{openAttendance ? 'You have an open attendance record for today.' : 'Check-in is limited to one record per employee and local workday.'}</p>
      </Panel>
      <Panel title="Monthly attendance calendar">
        <p className="mb-3 text-sm text-slate-500">{now.toLocaleString(undefined, { month: 'long', year: 'numeric' })}</p>
        <LoadState loading={calendarLoading} error={null} empty={calendarDays.length ? null : 'No calendar data.'}>
          <div className="grid grid-cols-7 gap-2">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <span className="pb-1 text-center text-xs font-semibold text-slate-400" key={`${day}-${index}`}>{day}</span>)}
            {Array.from({ length: new Date(now.getFullYear(), now.getMonth(), 1).getDay() }).map((_, index) => <span key={`empty-${index}`} />)}
            {calendarDays.map(({ day, record }) => <span key={day} title={record?.status || 'No record'} className={`grid aspect-square place-items-center rounded-lg text-xs ${record?.status === 'late' ? 'bg-amber-100 text-amber-800' : record ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-50 text-slate-400'}`}>{day}</span>)}
          </div>
        </LoadState>
      </Panel>
      <Panel title="Attendance history">
        <LoadState loading={loading} error={error} onRetry={() => setRefresh((key) => key + 1)} empty={records.length ? null : 'No attendance records for this workspace yet.'}>
          <DataTable columns={columns} rows={records} />
        </LoadState>
      </Panel>
    </div>
  );
}

export function LeavesPage({ user }) {
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ category: 'annual', startDate: '', endDate: '', reason: '', employeeId: user.employeeId || '' });
  const [employeeId, setEmployeeId] = useState(user.employeeId || '');
  const { data: employeesData } = useRemote('/employees?status=active&limit=100', refresh, user.role !== 'employee');
  const employees = employeesData?.data || [];
  const { data, loading, error } = useRemote('/leaves?limit=50&sortBy=startDate&sortOrder=desc', refresh);
  const { data: balance, loading: balanceLoading } = useRemote(`/leaves/balance?employeeId=${employeeId}&year=${new Date().getFullYear()}`, refresh, Boolean(employeeId));
  const leaves = data?.data || [];
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();
    if (!employeeId) return toast.error('Select an employee.');
    if (!form.startDate || !form.endDate || !form.reason.trim()) return toast.error('Complete all leave request fields.');
    setBusy(true);
    try {
      await api.post('/leaves', {
        employeeId,
        category: form.category,
        startDate: form.startDate,
        endDate: form.endDate,
        reason: form.reason.trim(),
      });
      toast.success('Leave request submitted for approval.');
      setForm((current) => ({ ...current, startDate: '', endDate: '', reason: '' }));
      setRefresh((key) => key + 1);
    } catch (requestError) {
      toast.error(requestError.response?.data?.message || 'Leave request could not be submitted.');
    } finally {
      setBusy(false);
    }
  };
  const cancel = async (leave) => {
    if (!window.confirm('Cancel this pending leave request?')) return;
    try {
      await api.patch(`/leaves/${leave._id}/cancel`);
      toast.success('Leave request cancelled.');
      setRefresh((key) => key + 1);
    } catch (requestError) {
      toast.error(requestError.response?.data?.message || 'Unable to cancel leave.');
    }
  };
  const categories = balance?.categories || {};
  const columns = [
    { key: 'employeeId', label: 'Employee', render: (row) => row.employeeId ? `${row.employeeId.firstName} ${row.employeeId.lastName}` : '—' },
    { key: 'category', label: 'Category', render: (row) => row.category },
    { key: 'startDate', label: 'Dates', render: (row) => `${row.startDate?.slice(0, 10)} – ${row.endDate?.slice(0, 10)}` },
    { key: 'days', label: 'Days' },
    { key: 'status', label: 'Status', render: (row) => <span className="capitalize">{row.status.replace('_', ' ')}</span> },
    { key: 'actions', label: '', render: (row) => row.status === 'pending' ? <button className="text-rose-600 hover:underline" onClick={() => cancel(row)}>Cancel</button> : null },
  ];
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Time away" title="Leave management" description="Request leave, check available balance, and track approval history." />
      {user.role !== 'employee' && <div className="max-w-sm"><label className="text-sm font-medium">Employee<select className={`${selectClass} mt-1`} value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}><option value="">Select employee</option>{employees.map((employee) => <option key={employee._id} value={employee._id}>{employee.firstName} {employee.lastName}</option>)}</select></label></div>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {['annual', 'sick', 'personal', 'parental'].map((key) => {
          const item = categories[key];
          return <div className={card} key={key}><p className="text-sm capitalize text-slate-500">{key} leave</p><p className="mt-2 text-2xl font-bold">{balanceLoading ? '—' : item ? `${Math.max(item.total - item.used - item.reserved, 0)} days` : 'Not configured'}</p><p className="text-xs text-slate-400">{item ? `${item.used} used · ${item.reserved} pending` : 'Default policy'}</p></div>;
        })}
      </div>
      <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <Panel title="Apply for leave">
          <form onSubmit={submit} className="space-y-3">
            <label className="block text-sm font-medium">Category<select className={`${selectClass} mt-1`} value={form.category} onChange={(event) => update('category', event.target.value)}>{['annual', 'sick', 'personal', 'parental', 'unpaid', 'other'].map((category) => <option value={category} key={category}>{category[0].toUpperCase() + category.slice(1)}</option>)}</select></label>
            <div className="grid grid-cols-2 gap-2"><Field label="From" type="date" required value={form.startDate} onChange={(value) => update('startDate', value)} /><Field label="To" type="date" required value={form.endDate} onChange={(value) => update('endDate', value)} /></div>
            <label className="block text-sm font-medium">Reason<textarea className={`${input} mt-1`} rows={4} minLength={5} maxLength={1000} value={form.reason} onChange={(event) => update('reason', event.target.value)} required /></label>
            <button className={primary} disabled={busy}>{busy ? 'Submitting…' : 'Submit request'}</button>
          </form>
        </Panel>
        <Panel title="Leave history">
          <LoadState loading={loading} error={error} onRetry={() => setRefresh((key) => key + 1)} empty={leaves.length ? null : 'No leave requests have been submitted.'}>
            <DataTable columns={columns} rows={leaves} />
          </LoadState>
        </Panel>
      </div>
    </div>
  );
}

export function ApprovalsPage({ user }) {
  const [type, setType] = useState('all');
  const [refresh, setRefresh] = useState(0);
  const [busyId, setBusyId] = useState(null);
  const { data, loading, error } = useRemote(`/approvals?type=${type}&limit=50`, refresh);
  const rows = data?.data || [];
  const decide = async (row, action) => {
    const note = action === 'reject' ? window.prompt('Reason for rejection (required):') : window.prompt('Approval note (optional):') || '';
    if (action === 'reject' && !note?.trim()) return;
    setBusyId(row._id);
    try {
      await api.post(`/approvals/${row.workflowType}/${row._id}/decision`, { action, note });
      toast.success(action === 'approve' ? 'Approval recorded.' : 'Request rejected.');
      setRefresh((key) => key + 1);
    } catch (requestError) {
      toast.error(requestError.response?.data?.message || 'Unable to process this approval.');
    } finally {
      setBusyId(null);
    }
  };
  const columns = [
    { key: 'workflowType', label: 'Type', render: (row) => row.workflowType },
    { key: 'employeeId', label: 'Employee', render: (row) => row.employeeId ? `${row.employeeId.firstName} ${row.employeeId.lastName}` : '—' },
    { key: 'summary', label: 'Request', render: (row) => row.workflowType === 'leave' ? `${row.category} · ${row.days} days` : row.workflowType === 'expense' ? `${row.currency || 'USD'} ${row.amount}` : `${row.periodYear}-${String(row.periodMonth).padStart(2, '0')} · ${row.currency} ${row.netPay}` },
    { key: 'createdAt', label: 'Submitted', render: (row) => new Date(row.createdAt).toLocaleDateString() },
    { key: 'action', label: 'Decision', render: (row) => <div className="flex gap-2"><button className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 disabled:opacity-50" disabled={busyId === row._id} onClick={() => decide(row, 'approve')}>Approve</button><button className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 disabled:opacity-50" disabled={busyId === row._id} onClick={() => decide(row, 'reject')}>Reject</button></div> },
  ];
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Approval center" title="Pending approvals" description={`Signed in as ${user.role.replaceAll('_', ' ')}.`} />
      <Panel>
        <div className="mb-4"><select className="max-w-xs rounded-xl border border-slate-200 px-3 py-2 text-sm" value={type} onChange={(event) => setType(event.target.value)}><option value="all">All requests</option><option value="leave">Leave requests</option><option value="expense">Expenses</option><option value="payroll">Payroll</option></select></div>
        <LoadState loading={loading} error={error} onRetry={() => setRefresh((key) => key + 1)} empty={rows.length ? null : 'There are no approvals waiting for your role.'}>
          <DataTable columns={columns} rows={rows} />
        </LoadState>
      </Panel>
    </div>
  );
}

export function PayrollPage({ canManage }) {
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [salary, setSalary] = useState({ basicMonthly: '', hraMonthly: '0', allowancesMonthly: '0', taxRate: '0.1', overtimeMultiplier: '1.5', currency: 'USD' });
  const [period, setPeriod] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 });
  const { data: employeePage } = useRemote('/employees?status=active&limit=100', refresh);
  const employees = employeePage?.data || [];
  const { data, loading, error } = useRemote('/payroll?limit=50&sortBy=periodMonth&sortOrder=desc', refresh);
  const { data: structures } = useRemote('/payroll/salary-structures?limit=100', refresh);
  const payrollRows = data?.data || [];

  const saveSalary = async (event) => {
    event.preventDefault();
    if (!employeeId || Number(salary.basicMonthly) <= 0) return toast.error('Choose an employee and enter a positive basic salary.');
    setBusy(true);
    try {
      await api.post('/payroll/salary-structures', {
        employeeId,
        effectiveFrom: new Date().toISOString(),
        basicMonthly: Number(salary.basicMonthly),
        hraMonthly: Number(salary.hraMonthly),
        allowancesMonthly: Number(salary.allowancesMonthly),
        taxRate: Number(salary.taxRate),
        overtimeMultiplier: Number(salary.overtimeMultiplier),
        currency: salary.currency,
      });
      toast.success('Salary structure saved.');
      setRefresh((key) => key + 1);
    } catch (requestError) {
      toast.error(requestError.response?.data?.message || 'Salary structure could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const generate = async () => {
    if (!window.confirm(`Generate payroll for ${period.year}-${String(period.month).padStart(2, '0')}? Existing periods will not be overwritten.`)) return;
    setBusy(true);
    try {
      const { data: result } = await api.post('/payroll/generate', { year: Number(period.year), month: Number(period.month) });
      toast.success(`Generated ${result.created.length} payroll record(s); skipped ${result.skipped.length}.`);
      setRefresh((key) => key + 1);
    } catch (requestError) {
      toast.error(requestError.response?.data?.message || 'Payroll generation failed.');
    } finally {
      setBusy(false);
    }
  };

  const lockPayroll = async (row) => {
    if (!window.confirm('Lock this payroll record? Locked payroll cannot be recalculated.')) return;
    try {
      await api.post(`/payroll/${row._id}/lock`, {});
      toast.success('Payroll locked.');
      setRefresh((key) => key + 1);
    } catch (requestError) {
      toast.error(requestError.response?.data?.message || 'Unable to lock payroll.');
    }
  };

  const payslip = async (row) => {
    try {
      const { data: blob } = await api.get(`/payroll/${row._id}/payslip.pdf`, { responseType: 'blob' });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = `payslip-${row.periodYear}-${String(row.periodMonth).padStart(2, '0')}.pdf`;
      anchor.click();
      URL.revokeObjectURL(href);
    } catch (requestError) {
      toast.error(requestError.response?.data?.message || 'Payslip download failed.');
    }
  };
  const columns = [
    { key: 'employeeId', label: 'Employee', render: (row) => row.employeeId ? `${row.employeeId.firstName} ${row.employeeId.lastName}` : '—' },
    { key: 'period', label: 'Period', render: (row) => `${row.periodYear}-${String(row.periodMonth).padStart(2, '0')}` },
    { key: 'grossPay', label: 'Gross', render: (row) => `${row.currency} ${row.grossPay.toFixed(2)}` },
    { key: 'netPay', label: 'Net pay', render: (row) => `${row.currency} ${row.netPay.toFixed(2)}` },
    { key: 'status', label: 'Status', render: (row) => <span className="capitalize">{row.status.replaceAll('_', ' ')}</span> },
    { key: 'actions', label: '', render: (row) => <div className="flex gap-2"><button className="text-blue-700" title="Download payslip" onClick={() => payslip(row)}><FileText size={16} /></button>{canManage && row.status === 'approved' && <button className="text-amber-700" onClick={() => lockPayroll(row)}>Lock</button>}</div> },
  ];
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Finance operations" title="Payroll" description="Salary history, controlled period generation, approval, and payslips." />
      {canManage && <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Salary structure">
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={saveSalary}>
            <label className="text-sm font-medium sm:col-span-2">Employee<select className={`${selectClass} mt-1`} required value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}><option value="">Select employee</option>{employees.map((employee) => <option key={employee._id} value={employee._id}>{employee.firstName} {employee.lastName}</option>)}</select></label>
            {['basicMonthly', 'hraMonthly', 'allowancesMonthly', 'taxRate', 'overtimeMultiplier'].map((key) => <Field key={key} label={key.replace(/([A-Z])/g, ' $1')} type="number" value={salary[key]} onChange={(value) => setSalary((current) => ({ ...current, [key]: value }))} required={key === 'basicMonthly'} />)}
            <label className="text-sm font-medium">Currency<select className={`${selectClass} mt-1`} value={salary.currency} onChange={(event) => setSalary((current) => ({ ...current, currency: event.target.value }))}><option>USD</option><option>EUR</option><option>GBP</option><option>INR</option></select></label>
            <button className={`${primary} sm:col-span-2`} disabled={busy}>{busy ? 'Saving…' : 'Save salary structure'}</button>
          </form>
        </Panel>
        <Panel title="Generate payroll">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Year" type="number" value={period.year} onChange={(value) => setPeriod((current) => ({ ...current, year: value }))} />
            <label className="text-sm font-medium">Month<select className={`${selectClass} mt-1`} value={period.month} onChange={(event) => setPeriod((current) => ({ ...current, month: Number(event.target.value) }))}>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{new Date(2000, index).toLocaleString(undefined, { month: 'long' })}</option>)}</select></label>
            <button className={`${primary} sm:col-span-2`} disabled={busy} onClick={generate}>{busy ? 'Working…' : 'Calculate & submit period'}</button>
          </div>
          <p className="mt-3 text-xs text-slate-500">Uses the latest effective salary, recorded attendance, paid/unpaid leave, configured tax rate, and overtime multiplier.</p>
        </Panel>
      </div>}
      <Panel title="Salary structures">
        <DataTable columns={[{ key: 'employeeId', label: 'Employee', render: (row) => row.employeeId ? `${row.employeeId.firstName} ${row.employeeId.lastName}` : '—' }, { key: 'basicMonthly', label: 'Basic / month', render: (row) => `${row.currency} ${row.basicMonthly.toFixed(2)}` }, { key: 'hraMonthly', label: 'HRA' }, { key: 'taxRate', label: 'Tax', render: (row) => `${(row.taxRate * 100).toFixed(1)}%` }, { key: 'status', label: 'Status' }]} rows={structures?.data || []} empty="No salary structures configured." />
      </Panel>
      <Panel title="Payroll history">
        <LoadState loading={loading} error={error} onRetry={() => setRefresh((key) => key + 1)} empty={payrollRows.length ? null : 'No payroll records have been generated.'}>
          <DataTable columns={columns} rows={payrollRows} />
        </LoadState>
      </Panel>
    </div>
  );
}

export function RecruitmentPage() {
  const [refresh, setRefresh] = useState(0);
  const [jobForm, setJobForm] = useState({ title: '', description: '', location: '', employmentType: 'full_time' });
  const [candidateForm, setCandidateForm] = useState({ fullName: '', email: '', phone: '' });
  const [selectedJobId, setSelectedJobId] = useState('');
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [busy, setBusy] = useState(false);
  const { data: jobData, loading: jobsLoading, error: jobsError } = useRemote('/recruitment/jobs?limit=100&sortBy=createdAt&sortOrder=desc', refresh);
  const { data: candidateData, loading: candidatesLoading } = useRemote('/recruitment/candidates?limit=100', refresh);
  const { data: applicationData, loading: applicationsLoading } = useRemote('/recruitment/applications?limit=100', refresh);
  const { data: analytics } = useRemote('/recruitment/analytics', refresh);
  const jobs = jobData?.data || [];
  const candidates = candidateData?.data || [];
  const applications = applicationData?.data || [];

  const createJob = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post('/recruitment/jobs', jobForm);
      toast.success('Job saved as a draft.');
      setSelectedJobId(data._id);
      setJobForm({ title: '', description: '', location: '', employmentType: 'full_time' });
      setRefresh((key) => key + 1);
    } catch (requestError) {
      toast.error(requestError.response?.data?.message || 'Job could not be created.');
    } finally {
      setBusy(false);
    }
  };
  const publish = async (job) => {
    try {
      await api.patch(`/recruitment/jobs/${job._id}/publish`, {});
      toast.success('Job published.');
      setRefresh((key) => key + 1);
    } catch (requestError) {
      toast.error(requestError.response?.data?.message || 'Unable to publish job.');
    }
  };
  const closeJob = async (job) => {
    if (!window.confirm(`Close the ${job.title} position?`)) return;
    try {
      await api.patch(`/recruitment/jobs/${job._id}/close`, {});
      toast.success('Job closed.');
      setRefresh((key) => key + 1);
    } catch (requestError) {
      toast.error(requestError.response?.data?.message || 'Unable to close job.');
    }
  };
  const saveCandidate = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post('/recruitment/candidates', candidateForm);
      setSelectedCandidateId(data._id);
      setCandidateForm({ fullName: '', email: '', phone: '' });
      toast.success('Candidate profile saved.');
      setRefresh((key) => key + 1);
    } catch (requestError) {
      toast.error(requestError.response?.data?.message || 'Candidate could not be saved.');
    } finally {
      setBusy(false);
    }
  };
  const applyCandidate = async () => {
    if (!selectedJobId || !selectedCandidateId) return toast.error('Select a published job and a candidate first.');
    try {
      await api.post('/recruitment/applications', { jobId: selectedJobId, candidateId: selectedCandidateId });
      toast.success('Application created.');
      setRefresh((key) => key + 1);
    } catch (requestError) {
      toast.error(requestError.response?.data?.message || 'Application could not be created.');
    }
  };
  const changeStage = async (application, status) => {
    try {
      await api.patch(`/recruitment/applications/${application._id}/stage`, { status });
      toast.success(`Candidate moved to ${status}.`);
      setRefresh((key) => key + 1);
    } catch (requestError) {
      toast.error(requestError.response?.data?.message || 'Unable to update candidate stage.');
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Talent acquisition" title="Recruitment" description="Manage open positions, candidate profiles, and applicant stages." />
      <div className="grid gap-3 sm:grid-cols-3">
        {[['Open jobs', analytics?.openJobs], ['Candidates', analytics?.candidates], ['Applications', applications.length]].map(([label, value]) => <div className={card} key={label}><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold">{value ?? '—'}</p></div>)}
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Create a job">
          <form onSubmit={createJob} className="space-y-3">
            <Field label="Role title" required value={jobForm.title} onChange={(value) => setJobForm((form) => ({ ...form, title: value }))} />
            <label className="block text-sm font-medium">Description<textarea className={`${input} mt-1`} rows={4} minLength={20} required value={jobForm.description} onChange={(event) => setJobForm((form) => ({ ...form, description: event.target.value }))} /></label>
            <div className="grid gap-3 sm:grid-cols-2"><Field label="Location" value={jobForm.location} onChange={(value) => setJobForm((form) => ({ ...form, location: value }))} /><label className="text-sm font-medium">Employment type<select className={`${selectClass} mt-1`} value={jobForm.employmentType} onChange={(event) => setJobForm((form) => ({ ...form, employmentType: event.target.value }))}><option value="full_time">Full-time</option><option value="part_time">Part-time</option><option value="contract">Contract</option><option value="intern">Intern</option></select></label></div>
            <button className={primary} disabled={busy}>{busy ? 'Saving…' : 'Save draft'}</button>
          </form>
        </Panel>
        <Panel title="Register a candidate">
          <form onSubmit={saveCandidate} className="space-y-3">
            <Field label="Full name" required value={candidateForm.fullName} onChange={(value) => setCandidateForm((form) => ({ ...form, fullName: value }))} />
            <Field label="Email" type="email" required value={candidateForm.email} onChange={(value) => setCandidateForm((form) => ({ ...form, email: value }))} />
            <Field label="Phone" value={candidateForm.phone} onChange={(value) => setCandidateForm((form) => ({ ...form, phone: value }))} />
            <button className={primary} disabled={busy}>{busy ? 'Saving…' : 'Save candidate'}</button>
          </form>
          <div className="mt-5 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <select className={selectClass} value={selectedJobId} onChange={(event) => setSelectedJobId(event.target.value)}><option value="">Published job</option>{jobs.filter((job) => job.status === 'published').map((job) => <option value={job._id} key={job._id}>{job.title}</option>)}</select>
            <select className={selectClass} value={selectedCandidateId} onChange={(event) => setSelectedCandidateId(event.target.value)}><option value="">Candidate</option>{candidates.map((candidate) => <option value={candidate._id} key={candidate._id}>{candidate.fullName}</option>)}</select>
            <button className={subtle} onClick={applyCandidate}>Apply</button>
          </div>
        </Panel>
      </div>
      <Panel title="Job postings">
        <LoadState loading={jobsLoading} error={jobsError} onRetry={() => setRefresh((key) => key + 1)} empty={jobs.length ? null : 'No job postings created.'}>
          <DataTable columns={[
            { key: 'title', label: 'Position', render: (job) => <div><span className="font-semibold">{job.title}</span><span className="block text-xs text-slate-400">{job.location || 'Location not set'}</span></div> },
            { key: 'employmentType', label: 'Type', render: (job) => job.employmentType?.replace('_', ' ') },
            { key: 'status', label: 'Status', render: (job) => <span className="capitalize">{job.status}</span> },
            { key: 'actions', label: 'Actions', render: (job) => <div className="flex gap-2">{job.status !== 'published' && job.status !== 'closed' && <button className="text-blue-700 hover:underline" onClick={() => publish(job)}>Publish</button>}{job.status !== 'closed' && <button className="text-rose-600 hover:underline" onClick={() => closeJob(job)}>Close</button>}</div> },
          ]} rows={jobs} />
        </LoadState>
      </Panel>
      <Panel title="Candidate pipeline">
        <LoadState loading={applicationsLoading || candidatesLoading} error={null} empty={applications.length ? null : 'No applications yet.'}>
          <DataTable columns={[
            { key: 'candidateId', label: 'Candidate', render: (app) => <div>{app.candidateId?.fullName}<span className="block text-xs text-slate-400">{app.candidateId?.email}</span></div> },
            { key: 'jobId', label: 'Position', render: (app) => app.jobId?.title },
            { key: 'status', label: 'Stage', render: (app) => <span className="capitalize">{app.status}</span> },
            { key: 'stageHistory', label: 'Move stage', render: (app) => <select className="rounded-lg border border-slate-200 px-2 py-1 text-xs" value={app.status} onChange={(event) => changeStage(app, event.target.value)}><option value="screening">Screening</option><option value="shortlisted">Shortlisted</option><option value="interview">Interview</option><option value="offered">Offered</option><option value="hired">Hired</option><option value="rejected">Rejected</option></select> },
          ]} rows={applications} />
        </LoadState>
      </Panel>
    </div>
  );
}

export function WorkspacePage({ user }) {
  const sections = [
    { key: 'departments', label: 'Departments', schema: { name: '', code: '', description: '' }, fields: ['name', 'code', 'description'] },
    { key: 'designations', label: 'Designations', schema: { title: '', level: '', departmentId: '' }, fields: ['title', 'level'] },
    { key: 'shifts', label: 'Shifts', schema: { name: '', startTime: '09:00', endTime: '17:00', graceMinutes: 10 }, fields: ['name', 'startTime', 'endTime', 'graceMinutes'] },
    { key: 'projects', label: 'Projects', schema: { name: '', description: '', ownerId: '' }, fields: ['name', 'description', 'ownerId'] },
    { key: 'tasks', label: 'Tasks', schema: { title: '', description: '', priority: 'medium', dueAt: '' }, fields: ['title', 'description', 'priority', 'dueAt'] },
    { key: 'assets', label: 'Assets', schema: { assetTag: '', name: '', category: '', serialNumber: '' }, fields: ['assetTag', 'name', 'category', 'serialNumber'] },
    { key: 'expenses', label: 'Expenses', schema: { category: '', amount: '', incurredAt: new Date().toISOString().slice(0, 10), description: '', employeeId: '' }, fields: ['category', 'amount', 'incurredAt', 'description', 'employeeId'] },
  ];
  const [section, setSection] = useState(sections[0].key);
  const [refresh, setRefresh] = useState(0);
  const [form, setForm] = useState(sections[0].schema);
  const [busy, setBusy] = useState(false);
  const selected = sections.find((item) => item.key === section);
  const { data, loading, error } = useRemote(`/${section}?limit=50&sortBy=createdAt&sortOrder=desc`, refresh);
  const { data: employeesData } = useRemote('/employees?status=active&limit=100', refresh, ['projects', 'tasks', 'assets', 'expenses'].includes(section));
  const employees = employeesData?.data || [];
  const rows = data?.data || [];

  const switchSection = (next) => {
    setSection(next);
    setForm(sections.find((item) => item.key === next).schema);
  };
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const payload = { ...form };
      for (const key of ['amount', 'graceMinutes']) if (payload[key] !== undefined) payload[key] = Number(payload[key]);
      if (payload.dueAt) payload.dueAt = new Date(payload.dueAt).toISOString();
      if (payload.incurredAt) payload.incurredAt = new Date(payload.incurredAt).toISOString();
      if (section === 'expenses' && user.role === 'employee') delete payload.employeeId;
      else if (['', null].includes(payload.employeeId)) delete payload.employeeId;
      const { data: created } = await api.post(`/${section}`, payload);
      toast.success(`${selected.label.slice(0, -1)} saved.`);
      setForm(selected.schema);
      setRefresh((key) => key + 1);
      if (section === 'tasks' && created?._id) toast('Task is visible in the task list.', { icon: '✓' });
    } catch (requestError) {
      toast.error(requestError.response?.data?.message || 'Could not save this record.');
    } finally {
      setBusy(false);
    }
  };
  const updateTask = async (task, status) => {
    try {
      await api.put(`/tasks/${task._id}`, { status });
      toast.success('Task status updated.');
      setRefresh((key) => key + 1);
    } catch (requestError) {
      toast.error(requestError.response?.data?.message || 'Task could not be updated.');
    }
  };
  const columns = useMemo(() => {
    if (section === 'departments') return [{ key: 'name', label: 'Department' }, { key: 'code', label: 'Code' }, { key: 'description', label: 'Description' }];
    if (section === 'designations') return [{ key: 'title', label: 'Designation' }, { key: 'level', label: 'Level' }];
    if (section === 'shifts') return [{ key: 'name', label: 'Shift' }, { key: 'startTime', label: 'Start' }, { key: 'endTime', label: 'End' }, { key: 'graceMinutes', label: 'Grace (min)' }];
    if (section === 'projects') return [{ key: 'name', label: 'Project' }, { key: 'status', label: 'Status' }, { key: 'startsAt', label: 'Start', render: (row) => row.startsAt?.slice(0, 10) || '—' }];
    if (section === 'tasks') return [{ key: 'title', label: 'Task' }, { key: 'priority', label: 'Priority' }, { key: 'dueAt', label: 'Due', render: (row) => row.dueAt?.slice(0, 10) || '—' }, { key: 'status', label: 'Status', render: (row) => <select className="rounded-lg border border-slate-200 px-2 py-1 text-xs" value={row.status} onChange={(event) => updateTask(row, event.target.value)}><option value="todo">To do</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="done">Done</option></select> }];
    if (section === 'assets') return [{ key: 'assetTag', label: 'Asset ID' }, { key: 'name', label: 'Asset' }, { key: 'category', label: 'Category' }, { key: 'status', label: 'Condition' }];
    return [{ key: 'category', label: 'Category' }, { key: 'amount', label: 'Amount', render: (row) => `${row.currency} ${row.amount}` }, { key: 'incurredAt', label: 'Date', render: (row) => row.incurredAt?.slice(0, 10) }, { key: 'status', label: 'Approval' }, { key: 'description', label: 'Description' }];
  }, [section]);
  const activeSectionRoles = section === 'expenses' || section === 'tasks' ? true : !['employee'].includes(user.role);

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Workspace tools" title="Company workspace" description="Maintain departments, shifts, work, assets, and expenses." />
      <div className="flex flex-wrap gap-2">{sections.map((item) => <button key={item.key} className={`${button} ${section === item.key ? 'bg-blue-600 text-white' : 'border border-slate-200 bg-white text-slate-600'}`} onClick={() => switchSection(item.key)}>{item.label}</button>)}</div>
      <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        {activeSectionRoles && <Panel title={`Add ${selected.label.slice(0, -1).toLowerCase()}`}>
          <form className="space-y-3" onSubmit={submit}>
            {selected.fields.map((field) => {
              if (field === 'employeeId' && user.role !== 'employee') return <label className="block text-sm font-medium" key={field}>Employee<select className={`${selectClass} mt-1`} required value={form.employeeId} onChange={(event) => setForm((current) => ({ ...current, employeeId: event.target.value }))}><option value="">Select employee</option>{employees.map((employee) => <option value={employee._id} key={employee._id}>{employee.firstName} {employee.lastName}</option>)}</select></label>;
              if (field === 'ownerId' || field === 'assigneeId' || field === 'managerId') return <label className="block text-sm font-medium" key={field}>{field.replace('Id', '')}<select className={`${selectClass} mt-1`} required={field === 'ownerId'} value={form[field] || ''} onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))}><option value="">Select employee</option>{employees.map((employee) => <option value={employee._id} key={employee._id}>{employee.firstName} {employee.lastName}</option>)}</select></label>;
              if (field === 'priority') return <label className="block text-sm font-medium" key={field}>Priority<select className={`${selectClass} mt-1`} value={form[field]} onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))}>{['low', 'medium', 'high', 'urgent'].map((item) => <option key={item}>{item}</option>)}</select></label>;
              if (field === 'description') return <label className="block text-sm font-medium" key={field}>Description<textarea className={`${input} mt-1`} rows={3} value={form[field] || ''} onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))} /></label>;
              return <Field key={field} label={field.replace(/([A-Z])/g, ' $1')} type={field === 'amount' || field === 'graceMinutes' ? 'number' : field === 'incurredAt' || field === 'dueAt' ? 'date' : 'text'} value={form[field] || ''} onChange={(value) => setForm((current) => ({ ...current, [field]: value }))} required={!['code', 'level', 'description', 'serialNumber', 'category'].includes(field)} />;
            })}
            <button className={primary} disabled={busy}>{busy ? 'Saving…' : 'Save record'}</button>
          </form>
        </Panel>}
        <Panel title={`${selected.label} directory`} className={activeSectionRoles ? '' : 'xl:col-span-2'}>
          <LoadState loading={loading} error={error} onRetry={() => setRefresh((key) => key + 1)} empty={rows.length ? null : `No ${selected.label.toLowerCase()} have been added.`}>
            <DataTable columns={columns} rows={rows} />
          </LoadState>
        </Panel>
      </div>
    </div>
  );
}

export async function uploadEmployeeDocument(file, employeeId, category = 'other') {
  const body = new FormData();
  body.append('file', file);
  if (employeeId) body.append('employeeId', employeeId);
  body.append('category', category);
  return api.post('/documents/upload', body);
}
