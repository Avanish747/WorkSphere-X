import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Navigate, NavLink, Route, Routes, useLocation, useNavigate,
} from 'react-router-dom';
import {
  Activity, Bell, BriefcaseBusiness, CalendarCheck2, CheckCheck, ChevronDown,
  CircleHelp, CreditCard, LayoutDashboard, LogOut, Menu, Moon, Search, ShieldCheck,
  Sun, Users, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from './services/api';
import { initializeSession, loginUser, logoutUser, registerCompany } from './store/authSlice';
import {
  ApprovalsPage, AttendancePage, DashboardPage, EmployeesPage, LeavesPage,
  LoadState, PageHeader, Panel, PayrollPage, RecruitmentPage, useRemote, WorkspacePage,
} from './pages/HRMSPages';

const navigation = [
  { path: '/', label: 'Overview', icon: LayoutDashboard, roles: ['super_admin', 'company_admin', 'hr_manager', 'department_manager', 'finance_manager', 'recruiter', 'employee'] },
  { path: '/employees', label: 'Employees', icon: Users, roles: ['super_admin', 'company_admin', 'hr_manager', 'department_manager', 'employee'] },
  { path: '/attendance', label: 'Attendance', icon: CalendarCheck2, roles: ['super_admin', 'company_admin', 'hr_manager', 'department_manager', 'employee'] },
  { path: '/leave', label: 'Leave', icon: CalendarCheck2, roles: ['super_admin', 'company_admin', 'hr_manager', 'department_manager', 'employee'] },
  { path: '/approvals', label: 'Approvals', icon: ShieldCheck, roles: ['super_admin', 'company_admin', 'hr_manager', 'department_manager', 'finance_manager'] },
  { path: '/payroll', label: 'Payroll', icon: CreditCard, roles: ['super_admin', 'company_admin', 'finance_manager', 'employee'] },
  { path: '/recruitment', label: 'Recruitment', icon: BriefcaseBusiness, roles: ['super_admin', 'company_admin', 'hr_manager', 'recruiter'] },
  { path: '/workspace', label: 'Workspace tools', icon: Activity, roles: ['super_admin', 'company_admin', 'hr_manager', 'department_manager', 'finance_manager', 'employee'] },
];

const roleLabels = {
  super_admin: 'Platform administrator',
  company_admin: 'Company administrator',
  hr_manager: 'HR manager',
  department_manager: 'Department manager',
  finance_manager: 'Finance manager',
  recruiter: 'Recruiter',
  employee: 'Employee',
};

function Splash({ message }) {
  return <div className="grid min-h-screen place-items-center bg-slate-950 text-white"><div className="text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-500 font-bold">WX</div><p className="mt-4 text-sm text-slate-300">{message}</p></div></div>;
}

function AuthPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const authStatus = useSelector((state) => state.auth.status);
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', companyName: '', fullName: '' });
  const [forgotOpen, setForgotOpen] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const busy = authStatus === 'loading';

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (mode === 'login') {
      const result = await dispatch(loginUser({ email: form.email.trim(), password: form.password }));
      if (loginUser.fulfilled.match(result)) {
        toast.success('Welcome to WorkSphere X.');
        navigate('/', { replace: true });
      } else setError(result.payload || 'Unable to sign in.');
      return;
    }
    if (form.password.length < 12 || !/[a-z]/.test(form.password) || !/[A-Z]/.test(form.password) || !/\d/.test(form.password) || !/[^A-Za-z0-9]/.test(form.password)) {
      setError('Use at least 12 characters with uppercase, lowercase, a number, and a symbol.');
      return;
    }
    const result = await dispatch(registerCompany({
      companyName: form.companyName.trim(),
      fullName: form.fullName.trim(),
      email: form.email.trim(),
      password: form.password,
    }));
    if (registerCompany.fulfilled.match(result)) {
      toast.success('Workspace created.');
      navigate('/', { replace: true });
    } else setError(result.payload || 'Unable to register this company.');
  };

  const requestReset = async (event) => {
    event.preventDefault();
    try {
      const { data } = await api.post('/auth/forgot-password', { email: form.email.trim() });
      setResetMessage(data.message);
      if (data.resetToken) setResetToken(data.resetToken);
    } catch (requestError) {
      setResetMessage(requestError.response?.data?.message || 'Unable to request password reset.');
    }
  };

  const submitReset = async (event) => {
    event.preventDefault();
    try {
      const { data } = await api.post('/auth/reset-password', { token: resetToken, password: newPassword });
      setResetMessage(data.message);
      setResetToken('');
      setNewPassword('');
      setForgotOpen(false);
      toast.success('Password updated. Sign in with your new password.');
    } catch (requestError) {
      setResetMessage(requestError.response?.data?.message || 'Unable to reset password.');
    }
  };

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  return (
    <div className="grid min-h-screen bg-slate-950 lg:grid-cols-[1.05fr_0.95fr]">
      <div className="relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -left-36 top-36 h-96 w-96 rounded-full bg-blue-600/30 blur-3xl" />
        <div className="absolute -right-20 bottom-10 h-80 w-80 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="relative flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-xl bg-blue-500 font-bold">WX</div><div><p className="text-xs uppercase tracking-[0.2em] text-slate-400">People, connected</p><p className="text-lg font-bold">WorkSphere X</p></div></div>
        <div className="relative max-w-xl">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-300">Empowering people.</p>
          <h1 className="mt-4 text-5xl font-bold leading-tight tracking-tight">Work better, together.</h1>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-slate-300">A secure workforce workspace for people operations, attendance, time away, payroll and hiring.</p>
          <div className="mt-9 grid gap-3 sm:grid-cols-2">
            {['Isolated company workspaces', 'Role-based access', 'Live workforce insights', 'Audited approval flows'].map((item) => <div key={item} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-200"><ShieldCheck size={17} className="text-cyan-300" />{item}</div>)}
          </div>
        </div>
        <p className="relative text-xs text-slate-500">WorkSphere X · Secure workforce management</p>
      </div>
      <div className="flex items-center justify-center bg-slate-50 p-5 sm:p-10">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-2xl shadow-slate-950/10 sm:p-9">
          <div className="mb-7 lg:hidden"><div className="grid h-11 w-11 place-items-center rounded-xl bg-blue-600 font-bold text-white">WX</div><p className="mt-3 font-bold">WorkSphere X</p></div>
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-blue-600">{forgotOpen ? 'Account recovery' : mode === 'login' ? 'Welcome back' : 'Get started'}</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-900">{forgotOpen ? 'Reset your password' : mode === 'login' ? 'Sign in to your workspace' : 'Create a company workspace'}</h2>
          <p className="mt-2 text-sm text-slate-500">{forgotOpen ? 'Enter your work email to request a secure reset link.' : mode === 'login' ? 'Your account and workspace are protected by role-based access.' : 'Set up your organization and administrator account.'}</p>

          {!forgotOpen && <div className="mt-6 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
            <button type="button" className={`rounded-lg py-2 text-sm font-semibold ${mode === 'login' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`} onClick={() => { setMode('login'); setError(''); }}>Sign in</button>
            <button type="button" className={`rounded-lg py-2 text-sm font-semibold ${mode === 'register' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`} onClick={() => { setMode('register'); setError(''); }}>Register</button>
          </div>}

          {forgotOpen ? (
            <div className="mt-6 space-y-4">
              <form className="space-y-4" onSubmit={requestReset}>
                <AuthField label="Work email" type="email" required value={form.email} onChange={(value) => update('email', value)} autoComplete="email" />
                <button className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white" disabled={busy}>Request reset</button>
              </form>
              {resetToken && <form className="space-y-4 border-t border-slate-100 pt-4" onSubmit={submitReset}>
                <label className="block text-sm font-medium">Reset token<input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" required value={resetToken} onChange={(event) => setResetToken(event.target.value)} /></label>
                <AuthField label="New password" type="password" required value={newPassword} onChange={setNewPassword} autoComplete="new-password" />
                <button className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white">Set new password</button>
              </form>}
              {resetMessage && <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-800">{resetMessage}</p>}
              <button className="text-sm font-semibold text-slate-500 hover:text-slate-900" onClick={() => { setForgotOpen(false); setResetMessage(''); }}>Back to sign in</button>
            </div>
          ) : (
            <form className="mt-6 space-y-4" onSubmit={submit}>
              {mode === 'register' && <>
                <AuthField label="Company name" required value={form.companyName} onChange={(value) => update('companyName', value)} autoComplete="organization" />
                <AuthField label="Administrator name" required value={form.fullName} onChange={(value) => update('fullName', value)} autoComplete="name" />
              </>}
              <AuthField label="Work email" type="email" required value={form.email} onChange={(value) => update('email', value)} autoComplete="email" />
              <AuthField label="Password" type="password" required value={form.password} onChange={(value) => update('password', value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
              {mode === 'login' && <div className="text-right"><button type="button" className="text-xs font-semibold text-blue-700 hover:underline" onClick={() => { setForgotOpen(true); setError(''); }}>Forgot password?</button></div>}
              {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
              <button className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in securely' : 'Create workspace'}</button>
              {mode === 'register' && <p className="text-xs leading-relaxed text-slate-500">Use at least 12 characters with upper- and lowercase letters, a number, and a symbol.</p>}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function RoleProtectedRoute({ user, path, children }) {
  const route = navigation.find((item) => item.path === path);
  return route?.roles.includes(user.role) ? children : <Navigate to="/" replace />;
}

function AuthField({ label, type = 'text', value, onChange, required, autoComplete }) {
  return <label className="block text-sm font-semibold text-slate-700">{label}<input className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 font-normal outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100" type={type} required={required} value={value} autoComplete={autoComplete} onChange={(event) => onChange(event.target.value)} /></label>;
}

function WorkspaceLayout({ user, company }) {
  const dispatch = useDispatch();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenu, setMobileMenu] = useState(false);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('worksphere_theme') === 'dark');
  const [notificationRefresh, setNotificationRefresh] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const visibleNavigation = navigation.filter((item) => item.roles.includes(user.role));
  const { data: notificationData, loading: notificationsLoading } = useRemote('/notifications?limit=8', notificationRefresh, notificationsOpen);
  const notifications = notificationData?.data || [];
  const unreadCount = notifications.filter((item) => !item.readAt).length;
  const activePage = visibleNavigation.find((item) => item.path === location.pathname);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('worksphere_theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);
  useEffect(() => setMobileMenu(false), [location.pathname]);

  const logout = async () => {
    try {
      await dispatch(logoutUser()).unwrap();
      toast.success('You are signed out.');
      navigate('/');
    } catch {
      toast.error('The sign-out request failed. Your session has been cleared locally.');
    }
  };
  const markRead = async (notification) => {
    try {
      await api.patch(`/notifications/${notification._id}/read`, {});
      setNotificationRefresh((key) => key + 1);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to update notification.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100">
      {mobileMenu && <button aria-label="Close navigation" className="fixed inset-0 z-30 bg-slate-950/50 lg:hidden" onClick={() => setMobileMenu(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col bg-slate-950 px-4 py-5 text-white transition-transform lg:translate-x-0 ${mobileMenu ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between border-b border-white/10 px-2 pb-5">
          <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-blue-500 font-bold">WX</div><div><p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">WorkSphere X</p><p className="font-bold">{company?.name || 'Workspace'}</p></div></div>
          <button className="rounded-lg p-2 text-slate-400 hover:bg-white/10 lg:hidden" onClick={() => setMobileMenu(false)} aria-label="Close menu"><X size={18} /></button>
        </div>
        <nav className="mt-6 flex-1 space-y-1">
          <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Workspace</p>
          {visibleNavigation.map(({ path, label, icon: Icon }) => <NavLink key={path} to={path} end={path === '/'} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${isActive ? 'bg-blue-600 text-white shadow-lg shadow-blue-950/30' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}><Icon size={18} />{label}</NavLink>)}
        </nav>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Signed in</p>
          <p className="mt-2 truncate text-sm font-semibold">{user.fullName}</p>
          <p className="mt-1 text-xs text-slate-400">{roleLabels[user.role] || user.role}</p>
          <button onClick={logout} className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white"><LogOut size={15} /> Sign out</button>
        </div>
      </aside>

      <div className="min-h-screen lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
          <div className="flex h-[76px] items-center justify-between gap-3 px-4 sm:px-7">
            <div className="flex min-w-0 items-center gap-3">
              <button className="rounded-xl border border-slate-200 p-2 text-slate-600 lg:hidden" onClick={() => setMobileMenu(true)} aria-label="Open menu"><Menu size={19} /></button>
              <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-600">Enterprise workforce platform</p><h1 className="truncate text-lg font-bold sm:text-xl">{activePage?.label || 'WorkSphere X'}</h1></div>
            </div>
            <div className="flex items-center gap-1.5">
              <button className="rounded-xl p-2.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'} onClick={() => setDarkMode((value) => !value)}>{darkMode ? <Sun size={18} /> : <Moon size={18} />}</button>
              <div className="relative">
                <button className="relative rounded-xl p-2.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title="Notifications" onClick={() => setNotificationsOpen((open) => !open)}><Bell size={18} />{unreadCount > 0 && <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900" />}</button>
                {notificationsOpen && <div className="absolute right-0 top-12 z-50 w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-3 text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-white"><div className="flex items-center justify-between px-2 py-1"><p className="font-bold">Notifications</p><button className="text-xs text-blue-600" onClick={() => setNotificationRefresh((key) => key + 1)}>Refresh</button></div><LoadState loading={notificationsLoading} error={null} empty={notifications.length ? null : 'No notifications yet.'}><div className="mt-2 max-h-80 space-y-1 overflow-y-auto">{notifications.map((item) => <div key={item._id} className={`rounded-xl p-3 ${item.readAt ? 'bg-slate-50 dark:bg-slate-800' : 'bg-blue-50 dark:bg-blue-950'}`}><div className="flex justify-between gap-2"><p className="text-sm font-semibold">{item.title}</p>{!item.readAt && <button onClick={() => markRead(item)} title="Mark as read"><CheckCheck size={16} className="text-blue-700" /></button>}</div><p className="mt-1 text-xs text-slate-500">{item.message}</p><p className="mt-1 text-[10px] text-slate-400">{new Date(item.createdAt).toLocaleString()}</p></div>)}</div></LoadState></div>}
              </div>
              <div className="hidden border-l border-slate-200 pl-3 sm:block dark:border-slate-700"><p className="max-w-40 truncate text-sm font-semibold">{user.fullName}</p><p className="text-[10px] text-slate-500">{roleLabels[user.role] || user.role}</p></div>
              <button onClick={logout} className="rounded-xl p-2.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title="Sign out"><LogOut size={18} /></button>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-7 sm:py-8">
          <Routes>
            <Route path="/" element={<DashboardPage user={user} />} />
            <Route path="/employees" element={<RoleProtectedRoute user={user} path="/employees"><EmployeesPage canManage={['super_admin', 'company_admin', 'hr_manager'].includes(user.role)} /></RoleProtectedRoute>} />
            <Route path="/attendance" element={<RoleProtectedRoute user={user} path="/attendance"><AttendancePage user={user} /></RoleProtectedRoute>} />
            <Route path="/leave" element={<RoleProtectedRoute user={user} path="/leave"><LeavesPage user={user} /></RoleProtectedRoute>} />
            <Route path="/approvals" element={<RoleProtectedRoute user={user} path="/approvals"><ApprovalsPage user={user} /></RoleProtectedRoute>} />
            <Route path="/payroll" element={<RoleProtectedRoute user={user} path="/payroll"><PayrollPage canManage={['super_admin', 'company_admin', 'finance_manager'].includes(user.role)} /></RoleProtectedRoute>} />
            <Route path="/recruitment" element={<RoleProtectedRoute user={user} path="/recruitment"><RecruitmentPage /></RoleProtectedRoute>} />
            <Route path="/workspace" element={<RoleProtectedRoute user={user} path="/workspace"><WorkspacePage user={user} /></RoleProtectedRoute>} />
            <Route path="/help" element={<HelpPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <footer className="mt-10 border-t border-slate-200 py-5 text-center text-xs text-slate-400 dark:border-slate-800">
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center sm:gap-6">
              <span>WorkSphere X · {company?.name || roleLabels[user.role]}</span>
              <span>Tenant-scoped workforce workspace</span>
            </div>
            <p className="mt-3 font-medium text-slate-500 dark:text-slate-400">Developed by Avanish Yadav</p>
          </footer>
        </main>
      </div>
    </div>
  );
}

function HelpPage() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(null);
  const [loading, setLoading] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post('/assistant/ask', { question });
      setAnswer(data);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to answer that question.');
    } finally {
      setLoading(false);
    }
  };
  return <div className="space-y-5"><PageHeader eyebrow="People support" title="HR assistant" description="Policy and workspace questions. The assistant does not approve or deny requests." /><Panel title="Ask about your HR workspace"><form className="space-y-3" onSubmit={submit}><textarea className="w-full rounded-xl border border-slate-200 p-3 text-sm" rows={4} minLength={3} maxLength={1000} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="How do I request annual leave?" required /><button disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white"><CircleHelp size={16} />{loading ? 'Checking…' : 'Ask HR assistant'}</button></form>{answer && <div className="mt-4 rounded-xl bg-slate-50 p-4"><p className="whitespace-pre-wrap text-sm leading-relaxed">{answer.answer}</p><p className="mt-2 text-xs text-slate-400">Mode: {answer.mode} · Sources: {answer.sources?.join(', ') || 'No employee data used'}</p></div>}</Panel></div>;
}

function App() {
  const dispatch = useDispatch();
  const { user, company, initialized } = useSelector((state) => state.auth);
  useEffect(() => {
    if (!initialized) dispatch(initializeSession());
  }, [dispatch, initialized]);

  if (!initialized) return <Splash message="Connecting securely to your workspace…" />;
  return user ? <WorkspaceLayout user={user} company={company} /> : <AuthPage />;
}

export default App;
