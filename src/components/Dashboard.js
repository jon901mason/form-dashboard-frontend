import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import jsPDF from 'jspdf';
import './Dashboard.css';
import AddClient from './AddClient';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const LOGO_URL = 'https://trade-craft.com/wp-content/uploads/2025/01/TRADECRAFT_LOGO_PRIMARY_rev.png';

function getAxiosErrorMessage(err) {
    if (err?.response?.data) {
        try {
            return typeof err.response.data === 'string'
                ? err.response.data
                : err.response.data.error || JSON.stringify(err.response.data);
        } catch {
            // ignore
        }
    }
    return err?.message || 'Unknown error';
}

function splitName(fullName) {
    const raw = String(fullName || '').trim();
    if (!raw) return { first: '', last: '' };
    const parts = raw.split(/\s+/);
    if (parts.length === 1) return { first: parts[0], last: '' };
    return { first: parts[0], last: parts.slice(1).join(' ') };
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now - d;
    const diffDays = Math.floor(diffMs / 86400000);

    const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (diffDays === 0) return `Today, ${timeStr}`;
    if (diffDays === 1) return `Yesterday, ${timeStr}`;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' + timeStr;
}

function pluginBadge(plugin) {
    if (!plugin) return null;
    const lower = plugin.toLowerCase();
    if (lower.includes('gravity')) return <span className="badge badge-gf">Gravity Forms</span>;
    if (lower.includes('elementor')) return <span className="badge badge-elementor">Elementor</span>;
    if (lower.includes('cf7') || lower.includes('contact-form-7') || lower.includes('contact form 7')) {
        return <span className="badge badge-cf7">Contact Form 7</span>;
    }
    return <span className="badge badge-gf">{plugin}</span>;
}

function getUserInitials(user) {
    if (!user) return '?';
    const name = user.name || user.email || '';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
}

function Dashboard({ user, token, onLogout, onUpdateUser }) {
    // ── Core state ──────────────────────────────────────────
    const [view, setView] = useState('home'); // 'home' | 'client' | 'consent'
    const [clients, setClients] = useState([]);
    const [selectedClient, setSelectedClient] = useState(null);
    const [forms, setForms] = useState([]);
    const [selectedForm, setSelectedForm] = useState(null);
    const [submissions, setSubmissions] = useState([]);

    // ── Home view state ──────────────────────────────────────
    const [stats, setStats] = useState({});
    const [recentSubmissions, setRecentSubmissions] = useState([]);

    // ── Consent form state ───────────────────────────────────
    const [consentSubmissions, setConsentSubmissions] = useState([]);
    const [selectedConsentSubmission, setSelectedConsentSubmission] = useState(null);

    // ── Client view state ────────────────────────────────────
    const [clientStats, setClientStats] = useState({});

    // ── UI state ─────────────────────────────────────────────
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showAddClient, setShowAddClient] = useState(false);
    const [showEditClient, setShowEditClient] = useState(false);
    const [showAccountSettings, setShowAccountSettings] = useState(false);
    const [showCreateUser, setShowCreateUser] = useState(false);
    const [clientsOpen, setClientsOpen] = useState(true);
    const [expandedClientIds, setExpandedClientIds] = useState(new Set());
    const [avatarOpen, setAvatarOpen] = useState(false);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [expandedMessages, setExpandedMessages] = useState(new Set());
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState(null); // { synced, skipped } | string (error)
    const syncResultTimer = useRef(null);

    const avatarRef = useRef(null);

    const headers = useMemo(
        () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }),
        [token]
    );

    // ── API helpers ──────────────────────────────────────────
    const fetchClients = useCallback(async () => {
        try {
            const res = await axios.get(`${API_URL}/api/clients`, { headers });
            const list = Array.isArray(res.data) ? res.data : [];
            setClients(list);
        } catch (err) {
            setError(`Failed to load clients: ${getAxiosErrorMessage(err)}`);
        }
    }, [headers]);

    const fetchStats = useCallback(async () => {
        try {
            const res = await axios.get(`${API_URL}/api/stats`, { headers });
            setStats(res.data || {});
        } catch {
            // stats are non-critical
        }
    }, [headers]);

    const fetchRecentSubmissions = useCallback(async () => {
        try {
            const res = await axios.get(`${API_URL}/api/submissions/recent?days=7`, { headers });
            setRecentSubmissions(Array.isArray(res.data) ? res.data : []);
        } catch {
            // non-critical
        }
    }, [headers]);

    const fetchClientStats = useCallback(async (clientId) => {
        try {
            const res = await axios.get(`${API_URL}/api/stats/client/${clientId}`, { headers });
            setClientStats(res.data || {});
        } catch {
            setClientStats({});
        }
    }, [headers]);

    const fetchFormsForClient = useCallback(async (client) => {
        if (!client?.id) return;
        setLoading(true);
        setSelectedForm(null);
        setSubmissions([]);
        setExpandedMessages(new Set());
        try {
            const res = await axios.get(`${API_URL}/api/forms/client/${client.id}`, { headers });
            setForms(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            setForms([]);
            setError(`Failed to load forms: ${getAxiosErrorMessage(err)}`);
        } finally {
            setLoading(false);
        }
    }, [headers]);

    const fetchSubmissionsForForm = useCallback(async (form) => {
        if (!form?.id) return;
        setLoading(true);
        setExpandedMessages(new Set());
        try {
            const res = await axios.get(`${API_URL}/api/forms/${form.id}/submissions`, { headers });
            setSubmissions(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            setSubmissions([]);
            setError(`Failed to load submissions: ${getAxiosErrorMessage(err)}`);
        } finally {
            setLoading(false);
        }
    }, [headers]);

    // ── Initial load ─────────────────────────────────────────
    useEffect(() => {
        fetchClients();
        fetchStats();
        fetchRecentSubmissions();
    }, [fetchClients, fetchStats, fetchRecentSubmissions]);

    // Reload home stats when returning to home
    useEffect(() => {
        if (view === 'home') {
            fetchStats();
            fetchRecentSubmissions();
        }
        if (view === 'consent') {
            fetchConsentSubmissions();
        }
    }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Close avatar dropdown on outside click ───────────────
    useEffect(() => {
        const handler = (e) => {
            if (avatarRef.current && !avatarRef.current.contains(e.target)) {
                setAvatarOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // ── Handlers ─────────────────────────────────────────────
    const handleHomeClick = () => {
        setView('home');
        setSelectedClient(null);
        setSelectedForm(null);
        setSubmissions([]);
        setError('');
    };

    const handleConsentFormClick = () => {
        setView('consent');
        setSelectedClient(null);
        setSelectedConsentSubmission(null);
        setError('');
    };

    const fetchConsentSubmissions = useCallback(async () => {
        try {
            const res = await axios.get(`${API_URL}/api/consent-form/submissions`, { headers });
            setConsentSubmissions(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            setError(`Failed to load consent form submissions: ${getAxiosErrorMessage(err)}`);
        }
    }, [headers]);

    const handleClientToggle = (clientId) => {
        setExpandedClientIds((prev) => {
            const next = new Set(prev);
            if (next.has(clientId)) {
                next.delete(clientId);
            } else {
                next.add(clientId);
            }
            return next;
        });
    };

    const handleClientSelect = (client) => {
        setExpandedClientIds((prev) => { const next = new Set(prev); next.add(client.id); return next; });
        setView('client');
        setSelectedClient(client);
        setError('');
        setSyncResult(null);
        fetchFormsForClient(client);
        fetchClientStats(client.id);
    };

    const handleFormSelect = async (form) => {
        setSelectedForm(form);
        setStartDate('');
        setEndDate('');
        await fetchSubmissionsForForm(form);
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this submission?')) return;
        try {
            await axios.delete(`${API_URL}/api/forms/submissions/${id}`, { headers });
            setSubmissions((prev) => prev.filter((s) => s.id !== id));
        } catch (err) {
            alert(getAxiosErrorMessage(err));
        }
    };

    const handleDeleteForm = async (form) => {
        if (!window.confirm(`Delete "${form.form_name}" and all its submissions?`)) return;
        try {
            await axios.delete(`${API_URL}/api/forms/${form.id}`, { headers });
            setForms((prev) => prev.filter((f) => f.id !== form.id));
            if (selectedForm?.id === form.id) {
                setSelectedForm(null);
                setSubmissions([]);
            }
        } catch (err) {
            alert(getAxiosErrorMessage(err));
        }
    };

    const handleSaveClient = async ({ name, wordpress_url }) => {
        try {
            const res = await axios.patch(
                `${API_URL}/api/clients/${selectedClient.id}`,
                { name, wordpress_url },
                { headers }
            );
            const updated = res.data;
            setClients((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
            setSelectedClient((prev) => ({ ...prev, ...updated }));
            setShowEditClient(false);
        } catch (err) {
            throw new Error(getAxiosErrorMessage(err));
        }
    };

    const handleDeleteClient = async () => {
        if (!selectedClient) return;
        if (!window.confirm(`Delete "${selectedClient.name}"? This will permanently remove all their forms and submissions.`)) return;
        try {
            await axios.delete(`${API_URL}/api/clients/${selectedClient.id}`, { headers });
            setClients((prev) => prev.filter((c) => c.id !== selectedClient.id));
            setExpandedClientIds((prev) => { const next = new Set(prev); next.delete(selectedClient.id); return next; });
            setView('home');
            setSelectedClient(null);
            setForms([]);
            setSubmissions([]);
            fetchStats();
        } catch (err) {
            alert(getAxiosErrorMessage(err));
        }
    };

    const handleSync = async () => {
        if (!selectedClient) return;
        setSyncing(true);
        setSyncResult(null);
        if (syncResultTimer.current) clearTimeout(syncResultTimer.current);

        try {
            const res = await axios.post(`${API_URL}/api/sync/client/${selectedClient.id}`, {}, { headers });
            setSyncResult({ synced: res.data.synced ?? 0, skipped: res.data.skipped ?? 0 });
            // Refresh submissions and stats
            if (selectedForm) await fetchSubmissionsForForm(selectedForm);
            await fetchClientStats(selectedClient.id);
        } catch (err) {
            setSyncResult(getAxiosErrorMessage(err));
        } finally {
            setSyncing(false);
            syncResultTimer.current = setTimeout(() => setSyncResult(null), 5000);
        }
    };

    const handleClientAdded = (newClient) => {
        setClients((prev) => [...prev, newClient]);
        fetchStats();
    };

    const toggleMessage = (id) => {
        setExpandedMessages((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    // ── Filtered submissions ──────────────────────────────────
    const filteredSubmissions = useMemo(() => {
        if (!startDate && !endDate) return submissions;
        return submissions.filter((sub) => {
            const d = new Date(sub.submitted_at);
            const start = startDate ? new Date(startDate) : new Date('1970-01-01');
            const end = endDate ? new Date(endDate) : new Date('2099-12-31');
            end.setHours(23, 59, 59, 999);
            return d >= start && d <= end;
        });
    }, [submissions, startDate, endDate]);

    // ── Column detection (Gravity Forms vs others) ────────────
    const hasCompoundName = useMemo(
        () => submissions.some((sub) => 'Name' in (sub?.submission_data || {})),
        [submissions]
    );

    const dataKeys = useMemo(() => {
        if (!submissions.length) return [];
        const keys = [];
        const seen = new Set();
        submissions.forEach((sub) => {
            Object.keys(sub?.submission_data || {}).forEach((key) => {
                if (hasCompoundName && key === 'Name') return;
                if (!seen.has(key)) { seen.add(key); keys.push(key); }
            });
        });
        return keys;
    }, [submissions, hasCompoundName]);

    const columns = useMemo(() => {
        if (!submissions.length) return [];
        if (hasCompoundName) return ['First Name', 'Last Name', ...dataKeys, 'Submitted', ''];
        return [...dataKeys, 'Submitted', ''];
    }, [submissions, dataKeys, hasCompoundName]);

    // ── CSV export ────────────────────────────────────────────
    const downloadCSV = () => {
        if (!filteredSubmissions.length) { alert('No submissions to download'); return; }
        const csvHeaders = hasCompoundName
            ? ['First Name', 'Last Name', ...dataKeys, 'Submitted']
            : [...dataKeys, 'Submitted'];
        const rows = filteredSubmissions.map((sub) => {
            const data = sub?.submission_data || {};
            const { first, last } = splitName(data?.Name);
            const vals = [
                ...(hasCompoundName ? [first, last] : []),
                ...dataKeys.map((k) => data?.[k] ?? ''),
                new Date(sub.submitted_at).toLocaleString(),
            ];
            return vals.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',');
        });
        const csv = [csvHeaders.join(','), ...rows].join('\n');
        const el = document.createElement('a');
        el.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(csv));
        el.setAttribute('download', `${selectedForm?.form_name || 'submissions'}.csv`);
        el.style.display = 'none';
        document.body.appendChild(el);
        el.click();
        document.body.removeChild(el);
    };

    // ── Render ────────────────────────────────────────────────
    const userName = user?.name || user?.email || 'User';
    const initials = getUserInitials(user);

    return (
        <div className="app-shell">
            {/* ── SIDEBAR ── */}
            <aside className="sidebar">
                <div className="sidebar-brand">
                    <div className="brand-icon">
                        <img src={LOGO_URL} alt="Trade Craft" />
                    </div>
                </div>

                <nav className="sidebar-nav">
                    <div className="nav-label">Menu</div>

                    <div
                        className={`nav-item${view === 'home' ? ' active' : ''}`}
                        onClick={handleHomeClick}
                    >
                        <span className="nav-icon"><i className="ph-light ph-house"></i></span>
                        Home
                    </div>

                    <div
                        className={`nav-item${view === 'consent' ? ' active' : ''}`}
                        onClick={handleConsentFormClick}
                    >
                        <span className="nav-icon"><i className="ph-light ph-file-text"></i></span>
                        Client Consent Form
                    </div>

                    <div
                        className={`nav-item${clientsOpen ? ' clients-open' : ''}${view === 'client' ? ' active' : ''}`}
                        onClick={() => setClientsOpen((o) => !o)}
                    >
                        <span className="nav-icon"><i className="ph-light ph-users"></i></span>
                        Clients
                        <span className="nav-chevron"><i className="ph-light ph-caret-down"></i></span>
                    </div>

                    <div className={`client-sub-list${clientsOpen ? ' open' : ''}`}>
                        {clients.map((c) => (
                            <div key={c.id}>
                                <div
                                    className={`client-sub-item${expandedClientIds.has(c.id) ? ' expanded' : ''}`}
                                    onClick={() => handleClientToggle(c.id)}
                                >
                                    <i className={`ph-light ${expandedClientIds.has(c.id) ? 'ph-caret-down' : 'ph-caret-right'}`}></i>
                                    {c.name}
                                </div>
                                <div className={`client-page-list${expandedClientIds.has(c.id) ? ' open' : ''}`}>
                                    <div
                                        className={`client-page-item${selectedClient?.id === c.id && view === 'client' ? ' active' : ''}`}
                                        onClick={() => handleClientSelect(c)}
                                    >
                                        <i className="ph-light ph-list-bullets"></i>
                                        Form Submissions
                                    </div>
                                </div>
                            </div>
                        ))}
                        {clients.length === 0 && (
                            <div className="client-sub-item" style={{ color: 'rgba(255,255,255,0.25)', cursor: 'default' }}>
                                No clients yet
                            </div>
                        )}
                    </div>
                </nav>
            </aside>

            {/* ── MAIN ── */}
            <div className="main">
                {/* ── TOPBAR ── */}
                <div className="topbar">
                    {view === 'client' && selectedClient ? (
                        <div className="topbar-client-section">
                            <span className="topbar-client-name">{selectedClient.name}</span>
                            <div className="topbar-client-actions">
                                <button className="delete-client-btn" onClick={() => setShowEditClient(true)}>
                                    <i className="ph-light ph-pencil-simple"></i> Edit
                                </button>
                                <button className="delete-client-btn" onClick={handleDeleteClient}>
                                    <i className="ph-light ph-trash"></i> Delete
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="topbar-title"></div>
                    )}

                    <button className="add-client-btn" onClick={() => setShowAddClient(true)}>
                        <span style={{ fontSize: 18, lineHeight: 1, marginTop: -1 }}>+</span> Add Client
                    </button>

                    <div className="avatar-wrap" ref={avatarRef} onClick={() => setAvatarOpen((o) => !o)}>
                        <div className="avatar">
                            {user?.avatar_url
                                ? <img src={user.avatar_url} alt={initials} className="avatar-img" />
                                : initials}
                        </div>
                        {avatarOpen && (
                            <div className="avatar-dropdown">
                                <div className="dropdown-header">
                                    <div className="dh-name">{userName}</div>
                                    <div className="dh-email">{user?.email || ''}</div>
                                </div>
                                <div className="dropdown-item" onClick={(e) => { e.stopPropagation(); setAvatarOpen(false); setShowAccountSettings(true); }}>
                                    <i className="ph-light ph-gear"></i> Account Settings
                                </div>
                                {user?.is_admin && (
                                    <div className="dropdown-item" onClick={(e) => { e.stopPropagation(); setAvatarOpen(false); setShowCreateUser(true); }}>
                                        <i className="ph-light ph-user-plus"></i> Create User
                                    </div>
                                )}
                                <div
                                    className="dropdown-item danger"
                                    onClick={(e) => { e.stopPropagation(); onLogout(); }}
                                >
                                    <i className="ph-light ph-sign-out"></i> Log Out
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── CONTENT ── */}
                <div className="content">
                    {error && <div className="error-banner">{error}</div>}

                    {view === 'home' ? (
                        <HomeView
                            stats={stats}
                            recentSubmissions={recentSubmissions}
                            loading={loading}
                            onClientClick={handleClientSelect}
                            user={user}
                        />
                    ) : view === 'consent' ? (
                        <ConsentFormView
                            submissions={consentSubmissions}
                            selectedSubmission={selectedConsentSubmission}
                            onSelectSubmission={setSelectedConsentSubmission}
                            onDelete={async (id) => {
                                if (!window.confirm('Delete this submission?')) return;
                                try {
                                    await axios.delete(`${API_URL}/api/forms/submissions/${id}`, { headers });
                                    setConsentSubmissions((prev) => prev.filter((s) => s.id !== id));
                                } catch (err) {
                                    alert(getAxiosErrorMessage(err));
                                }
                            }}
                        />
                    ) : (
                        <ClientView
                            client={selectedClient}
                            clientStats={clientStats}
                            forms={forms}
                            selectedForm={selectedForm}
                            onFormSelect={handleFormSelect}
                            filteredSubmissions={filteredSubmissions}
                            submissions={submissions}
                            columns={columns}
                            hasCompoundName={hasCompoundName}
                            dataKeys={dataKeys}
                            expandedMessages={expandedMessages}
                            onToggleMessage={toggleMessage}
                            onDelete={handleDelete}
                            onDeleteForm={handleDeleteForm}
                            startDate={startDate}
                            endDate={endDate}
                            setStartDate={setStartDate}
                            setEndDate={setEndDate}
                            onDownloadCSV={downloadCSV}
                            onSync={handleSync}
                            syncing={syncing}
                            syncResult={syncResult}
                            loading={loading}
                        />
                    )}
                </div>
            </div>

            {showAddClient && (
                <AddClient
                    token={token}
                    onClientAdded={handleClientAdded}
                    onClose={() => setShowAddClient(false)}
                />
            )}

            {showEditClient && selectedClient && (
                <EditClient
                    client={selectedClient}
                    onSave={handleSaveClient}
                    onClose={() => setShowEditClient(false)}
                />
            )}

            {showAccountSettings && (
                <AccountSettings
                    user={user}
                    token={token}
                    onSave={onUpdateUser}
                    onClose={() => setShowAccountSettings(false)}
                />
            )}

            {showCreateUser && (
                <CreateUser
                    token={token}
                    onClose={() => setShowCreateUser(false)}
                />
            )}
        </div>
    );
}

// ── HOME VIEW ─────────────────────────────────────────────────
function HomeView({ stats, recentSubmissions, loading, onClientClick, user }) {
    const firstName = user?.name ? user.name.split(' ')[0] : null;
    const dailyTrend = stats.dailyTrend ?? [];

    const lastMonth = stats.lastMonthSubmissions ?? 0;
    const thisMonth = stats.submissionsThisMonth ?? 0;
    let monthTrend = null;
    if (lastMonth > 0) {
        const pct = Math.round(((thisMonth - lastMonth) / lastMonth) * 100);
        monthTrend = { direction: pct >= 0 ? 'up' : 'down', label: `${pct >= 0 ? '+' : ''}${pct}% vs last month` };
    } else if (thisMonth > 0) {
        monthTrend = { direction: 'up', label: 'New this month' };
    }

    return (
        <>
            <div className="page-heading">
                <h1>Welcome back{firstName ? `, ${firstName}` : ''}.</h1>
                <p>Here's what's happening across your clients.</p>
            </div>

            <div className="stat-grid-home">
                <StatCardHome
                    label="Total Submissions"
                    value={stats.totalSubmissions ?? '—'}
                    iconClass="ph-light ph-tray-arrow-down"
                    color="teal"
                    sparklineData={dailyTrend}
                />
                <StatCardHome
                    label="Submissions This Month"
                    value={stats.submissionsThisMonth ?? '—'}
                    iconClass="ph-light ph-calendar"
                    color="green"
                    sparklineData={dailyTrend}
                    trend={monthTrend}
                />
                <StatCardHome
                    label="Active Clients"
                    value={stats.activeClients ?? '—'}
                    iconClass="ph-light ph-buildings"
                    color="blue"
                    sparklineData={dailyTrend}
                />
                <StatCardHome
                    label="Active Forms"
                    value={stats.activeForms ?? '—'}
                    iconClass="ph-light ph-clipboard-text"
                    color="orange"
                    sparklineData={dailyTrend}
                />
            </div>

            <div className="section-card">
                <div className="section-header">
                    <div>
                        <h2>Recent Submissions</h2>
                        <p>Latest form activity across all clients — last 7 days</p>
                    </div>
                </div>
                <div className="table-scroll">
                    {loading ? (
                        <div className="loading-state">Loading…</div>
                    ) : recentSubmissions.length === 0 ? (
                        <div className="empty-state">No submissions in the last 7 days</div>
                    ) : (
                        <table>
                            <thead>
                                <tr>
                                    <th>Client</th>
                                    <th>Form</th>
                                    <th>Plugin</th>
                                    <th>Submitted</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentSubmissions.map((sub) => (
                                    <tr key={sub.id}>
                                        <td>
                                            <span
                                                className="client-name-cell"
                                                style={{ cursor: 'pointer' }}
                                                onClick={() => onClientClick({ id: sub.client_id, name: sub.client_name })}
                                            >
                                                {sub.client_name}
                                            </span>
                                        </td>
                                        <td>{sub.form_name}</td>
                                        <td>{pluginBadge(sub.form_plugin)}</td>
                                        <td>{formatDate(sub.submitted_at)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </>
    );
}


function StatCardHome({ label, value, iconClass, color, sparklineData, trend }) {
    return (
        <div className="stat-card-home">
            <div className="stat-card-home-top">
                <div className="stat-label">{label}</div>
                <div className={`stat-icon-box ${color}`}>
                    <i className={iconClass}></i>
                </div>
            </div>
            <div className="stat-value">{value}</div>
            {trend && (
                <div className={`stat-trend ${trend.direction}`}>
                    {trend.direction === 'up' ? '↑' : '↓'} {trend.label}
                </div>
            )}
        </div>
    );
}

// ── CLIENT VIEW ───────────────────────────────────────────────
function ClientView({
    client, clientStats, forms, selectedForm, onFormSelect,
    filteredSubmissions, submissions, columns, hasCompoundName, dataKeys,
    expandedMessages, onToggleMessage, onDelete, onDeleteForm,
    startDate, endDate, setStartDate, setEndDate, onDownloadCSV,
    onSync, syncing, syncResult, loading,
}) {
    if (!client) return null;

    return (
        <>
            {/* Page top: heading + stats + sync */}
            <div className="page-top">
                <div className="page-top-left">
                    <h1>Form Submissions</h1>
                </div>
                <div className="page-top-right">
                    <div className="stat-grid-client">
                        <div className="stat-card-client">
                            <div className="stat-icon-box teal">
                                <i className="ph-light ph-tray-arrow-down"></i>
                            </div>
                            <div className="stat-text">
                                <div className="stat-label">Total Submissions</div>
                                <div className="stat-value">{clientStats.totalSubmissions ?? '—'}</div>
                            </div>
                        </div>
                        <div className="stat-card-client">
                            <div className="stat-icon-box orange">
                                <i className="ph-light ph-calendar"></i>
                            </div>
                            <div className="stat-text">
                                <div className="stat-label">This Month</div>
                                <div className="stat-value">{clientStats.submissionsThisMonth ?? '—'}</div>
                            </div>
                        </div>
                    </div>

                    <button className="sync-btn" onClick={onSync} disabled={syncing}>
                        <i className={`ph-light ${syncing ? 'ph-circle-notch' : 'ph-arrows-clockwise'}`}></i>
                        {syncing ? 'Syncing…' : 'Sync'}
                    </button>

                    {syncResult && typeof syncResult === 'object' && (
                        <div className="sync-result success">
                            {syncResult.synced} new {syncResult.synced === 1 ? 'submission' : 'submissions'} added
                        </div>
                    )}
                    {syncResult && typeof syncResult === 'string' && (
                        <div className="sync-result error">Sync failed: {syncResult}</div>
                    )}
                </div>
            </div>

            {/* Forms + Submissions grid */}
            <div className="client-body">
                {/* Forms list */}
                <div className="forms-card">
                    <div className="forms-card-header">Forms</div>
                    {loading && !forms.length ? (
                        <div className="loading-state">Loading…</div>
                    ) : forms.length === 0 ? (
                        <div className="forms-empty">No forms found</div>
                    ) : (
                        forms.map((form) => (
                            <div
                                key={form.id}
                                className={`form-item${selectedForm?.id === form.id ? ' active' : ''}`}
                                onClick={() => onFormSelect(form)}
                            >
                                <i className="ph-light ph-file-text"></i>
                                <div className="form-item-text">
                                    {form.form_name}
                                    <span className="form-plugin">{pluginLabel(form.form_plugin)}</span>
                                </div>
                                <button
                                    className="form-delete-btn"
                                    title="Delete form"
                                    onClick={(e) => { e.stopPropagation(); onDeleteForm(form); }}
                                >
                                    <i className="ph-light ph-trash"></i>
                                </button>
                            </div>
                        ))
                    )}
                </div>

                {/* Submissions table */}
                <div className="submissions-card">
                    {selectedForm ? (
                        <>
                            <div className="submissions-header">
                                <div>
                                    <h2>{selectedForm.form_name}</h2>
                                    <p>Showing submissions for this form</p>
                                </div>
                                <div className="header-actions">
                                    <div className="date-filter">
                                        From
                                        <input
                                            type="date"
                                            value={startDate}
                                            onChange={(e) => setStartDate(e.target.value)}
                                        />
                                        To
                                        <input
                                            type="date"
                                            value={endDate}
                                            onChange={(e) => setEndDate(e.target.value)}
                                        />
                                    </div>
                                    <button className="csv-btn" onClick={onDownloadCSV}>
                                        <i className="ph-light ph-download-simple"></i> CSV
                                    </button>
                                </div>
                            </div>

                            <div className="submission-count">
                                Showing {filteredSubmissions.length} of {submissions.length} submissions
                            </div>

                            <div className="submissions-table-scroll">
                                {loading ? (
                                    <div className="loading-state">Loading…</div>
                                ) : filteredSubmissions.length === 0 ? (
                                    <div className="empty-state">No submissions found</div>
                                ) : (
                                    <table>
                                        <thead>
                                            <tr>
                                                {columns.map((col, i) => (
                                                    <th key={i}>{col}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredSubmissions.map((sub) => {
                                                const data = sub?.submission_data || {};
                                                const { first, last } = splitName(data?.Name);
                                                const isExpanded = expandedMessages.has(sub.id);

                                                return (
                                                    <tr key={sub.id}>
                                                        {hasCompoundName && <td>{first}</td>}
                                                        {hasCompoundName && <td>{last}</td>}

                                                        {dataKeys.map((key) => {
                                                            const val = String(data?.[key] ?? '');
                                                            const isLong = val.length > 100;
                                                            if (isLong) {
                                                                return (
                                                                    <td key={key} className={`msg-cell${isExpanded ? ' expanded' : ''}`}>
                                                                        <span className="msg-short">{val.slice(0, 80)}…</span>
                                                                        <span className="msg-full">{val}</span>
                                                                        <button
                                                                            className="msg-toggle"
                                                                            onClick={() => onToggleMessage(sub.id)}
                                                                        >
                                                                            {isExpanded ? 'less' : 'more'}
                                                                        </button>
                                                                    </td>
                                                                );
                                                            }
                                                            return <td key={key}>{val}</td>;
                                                        })}

                                                        <td>{formatDate(sub.submitted_at)}</td>

                                                        <td>
                                                            <button
                                                                className="delete-btn"
                                                                onClick={() => onDelete(sub.id)}
                                                            >
                                                                Delete
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="empty-state">
                            {forms.length === 0
                                ? 'No forms found for this client.'
                                : 'Select a form to view submissions.'}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}

function EditClient({ client, onSave, onClose }) {
    const [name, setName] = useState(client.name || '');
    const [wordpressUrl, setWordpressUrl] = useState(client.wordpress_url || '');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError('');
        try {
            await onSave({ name, wordpress_url: wordpressUrl });
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-box">
                <div className="modal-header">
                    <h2>Edit Client</h2>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>
                {error && <div className="modal-error">{error}</div>}
                <form onSubmit={handleSubmit}>
                    <div className="modal-form-group">
                        <label>Client Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                        />
                    </div>
                    <div className="modal-form-group">
                        <label>WordPress Site URL</label>
                        <input
                            type="url"
                            value={wordpressUrl}
                            onChange={(e) => setWordpressUrl(e.target.value)}
                            required
                        />
                    </div>
                    <div className="modal-actions">
                        <button type="button" className="modal-cancel-btn" onClick={onClose}>Cancel</button>
                        <button type="submit" className="modal-save-btn" disabled={saving}>
                            {saving ? 'Saving…' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function AccountSettings({ user, token, onSave, onClose }) {
    const [name, setName] = useState(user?.name || '');
    const [email, setEmail] = useState(user?.email || '');
    const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError('');
        try {
            const res = await axios.patch(`${API_URL}/api/auth/me`, { name, email, avatar_url: avatarUrl || null }, {
                headers: { Authorization: `Bearer ${token}` },
            });
            onSave(res.data.user);
            onClose();
        } catch (err) {
            setError(getAxiosErrorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-box">
                <div className="modal-header">
                    <h2>Account Settings</h2>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>
                {error && <div className="modal-error">{error}</div>}
                <form onSubmit={handleSubmit}>
                    <div className="modal-form-group">
                        <label>Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                        />
                    </div>
                    <div className="modal-form-group">
                        <label>Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>
                    <div className="modal-form-group">
                        <label>Profile Photo URL</label>
                        <input
                            type="url"
                            value={avatarUrl}
                            onChange={(e) => setAvatarUrl(e.target.value)}
                            placeholder="https://..."
                        />
                    </div>
                    <div className="modal-actions">
                        <button type="button" className="modal-cancel-btn" onClick={onClose}>Cancel</button>
                        <button type="submit" className="modal-save-btn" disabled={saving}>
                            {saving ? 'Saving…' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ── CREATE USER ───────────────────────────────────────────────
function CreateUser({ token, onClose }) {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [avatarUrl, setAvatarUrl] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError('');
        setSuccess('');
        try {
            await axios.post(`${API_URL}/api/admin/users`, { name, email, password, avatar_url: avatarUrl || null }, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setSuccess(`Account created for ${email}`);
            setName('');
            setEmail('');
            setPassword('');
            setAvatarUrl('');
        } catch (err) {
            setError(err?.response?.data?.error || 'Failed to create user');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-box">
                <div className="modal-header">
                    <h2>Create User</h2>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>
                {error && <div className="modal-error">{error}</div>}
                {success && <div className="modal-success">{success}</div>}
                <form onSubmit={handleSubmit}>
                    <div className="modal-form-group">
                        <label>Name</label>
                        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
                    </div>
                    <div className="modal-form-group">
                        <label>Email</label>
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                    </div>
                    <div className="modal-form-group">
                        <label>Password</label>
                        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
                    </div>
                    <div className="modal-form-group">
                        <label>Profile Photo URL</label>
                        <input type="url" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://..." />
                    </div>
                    <div className="modal-actions">
                        <button type="button" className="modal-cancel-btn" onClick={onClose}>Cancel</button>
                        <button type="submit" className="modal-save-btn" disabled={saving}>
                            {saving ? 'Creating…' : 'Create User'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ── CONSENT FORM FIELD ORDER ───────────────────────────────────
const CONSENT_FIELD_ORDER = [
    'Company Name (official company name to include on invoices)',
    'Client Name (main point of contact)',
    'Client Email',
    'Client Phone',
    'Street Address',
    'City',
    'State',
    'ZIP Code',
    'Company Main Phone Number',
    'Company Website',
    'Is your physical address different from your mailing address?',
    'Accounting Contact Name',
    'Accounting Contact Email',
    'Accounting Contact Phone Number',
    'Is your accounting address different from your mailing address?',
    'Sales Tax Status',
    'Additional Invoicing Instructions',
    'Payment',
    'Payment to Media Vendors',
    'Production & Hard Costs Billing',
    'Sales Tax',
    'Overdue Invoices',
    'Artificial Intelligence',
    'Termination',
    'Signature',
];

function sortedConsentEntries(submissionData) {
    const entries = Object.entries(submissionData || {});
    return entries.sort(([a], [b]) => {
        const ai = CONSENT_FIELD_ORDER.indexOf(a);
        const bi = CONSENT_FIELD_ORDER.indexOf(b);
        const aPos = ai === -1 ? 9999 : ai;
        const bPos = bi === -1 ? 9999 : bi;
        return aPos - bPos;
    });
}

// ── CONSENT FORM HELPERS ───────────────────────────────────────
function getCompanyName(submissionData) {
    if (!submissionData) return 'Unknown';
    const key = Object.keys(submissionData).find((k) =>
        k.toLowerCase().includes('company name')
    );
    return key ? (submissionData[key] || 'Unknown') : 'Unknown';
}

async function fetchImageAsDataURL(url) {
    try {
        const res = await fetch(url);
        const blob = await res.blob();
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch {
        return null;
    }
}

async function downloadConsentPDF(submission) {
    const doc = new jsPDF();
    const companyName = getCompanyName(submission.submission_data);
    const wpBase = submission.wordpress_url ? submission.wordpress_url.replace(/\/$/, '') : '';

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(`TradeCraft Client Consent Form - ${companyName}`, 20, 20);

    doc.setLineWidth(0.5);
    doc.line(20, 25, 190, 25);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Submitted: ${new Date(submission.submitted_at).toLocaleString()}`, 20, 33);

    let y = 45;
    for (const [key, value] of sortedConsentEntries(submission.submission_data)) {
        const strVal = String(value || '');
        const isSignature = strVal.endsWith('.png') && !strVal.startsWith('http');

        doc.setFont('helvetica', 'bold');
        doc.text(`${key}:`, 20, y);
        y += 6;

        if (isSignature && wpBase) {
            const sigUrl = `${wpBase}/wp-content/uploads/gravity_forms/sig/${strVal}`;
            const dataUrl = await fetchImageAsDataURL(sigUrl);
            if (dataUrl) {
                if (y + 40 > 270) { doc.addPage(); y = 20; }
                doc.addImage(dataUrl, 'PNG', 20, y, 80, 30);
                y += 36;
            } else {
                doc.setFont('helvetica', 'normal');
                doc.text('[Signature image unavailable]', 20, y);
                y += 8;
            }
        } else if (strVal === 'Agreed') {
            doc.setFont('helvetica', 'normal');
            doc.text('\u2713 Agreed', 20, y);
            y += 8;
        } else {
            doc.setFont('helvetica', 'normal');
            const lines = doc.splitTextToSize(strVal || '—', 150);
            doc.text(lines, 20, y);
            y += lines.length * 6 + 4;
        }

        if (y > 270) { doc.addPage(); y = 20; }
    }

    doc.save(`consent-form-${companyName.replace(/\s+/g, '-')}.pdf`);
}

function ConsentFieldRow({ label, strVal, sigUrl, isAgreement }) {
    const [expanded, setExpanded] = useState(false);
    return (
        <div className="consent-field-row">
            <div className="consent-field-label">{label}</div>
            <div className="consent-field-value">
                {sigUrl ? (
                    <img src={sigUrl} alt="Signature" className="consent-signature-img" />
                ) : isAgreement ? (
                    <div className="consent-agreement">
                        <span className="consent-agreed-badge">✓ Agreed</span>
                        <button className="consent-expand-btn" onClick={() => setExpanded(e => !e)}>
                            {expanded ? 'hide terms' : 'view terms'}
                        </button>
                        {expanded && <div className="consent-agreement-text">{strVal}</div>}
                    </div>
                ) : (
                    strVal || '—'
                )}
            </div>
        </div>
    );
}

// ── CONSENT FORM VIEW ──────────────────────────────────────────
function ConsentFormView({ submissions, selectedSubmission, onSelectSubmission, onDelete }) {
    if (selectedSubmission) {
        const companyName = getCompanyName(selectedSubmission.submission_data);
        return (
            <>
                <div className="page-heading">
                    <button className="consent-detail-back" onClick={() => onSelectSubmission(null)}>
                        <i className="ph-light ph-arrow-left"></i> Back to list
                    </button>
                    <h1>{companyName}</h1>
                    <p>Submitted: {new Date(selectedSubmission.submitted_at).toLocaleString()}</p>
                </div>

                <div className="section-card">
                    <div className="section-header">
                        <div>
                            <h2>Consent Form Details</h2>
                        </div>
                        <button className="pdf-btn" onClick={() => downloadConsentPDF(selectedSubmission).catch(console.error)}>
                            <i className="ph-light ph-download-simple"></i> Download PDF
                        </button>
                    </div>
                    <div className="consent-detail-fields">
                        {sortedConsentEntries(selectedSubmission.submission_data).map(([key, value]) => {
                            const strVal = String(value || '');
                            const isSignature = strVal.endsWith('.png') && !strVal.startsWith('http');
                            const sigUrl = isSignature && selectedSubmission.wordpress_url
                                ? `${selectedSubmission.wordpress_url.replace(/\/$/, '')}/wp-content/uploads/gravity_forms/sig/${strVal}`
                                : null;
                            const isAgreement = strVal === 'Agreed';
                            return (
                                <ConsentFieldRow
                                    key={key}
                                    label={key}
                                    strVal={strVal}
                                    sigUrl={sigUrl}
                                    isAgreement={isAgreement}
                                />
                            );
                        })}
                    </div>
                </div>
            </>
        );
    }

    return (
        <>
            <div className="page-heading">
                <h1>Client Consent Form</h1>
                <p>All submissions for the TradeCraft Client Consent Form.</p>
            </div>

            <div className="section-card">
                <div className="section-header">
                    <div>
                        <h2>Submissions</h2>
                        <p>{submissions.length} total</p>
                    </div>
                </div>
                <div className="table-scroll">
                    {submissions.length === 0 ? (
                        <div className="empty-state">No submissions found. Sync TradeCraft to populate.</div>
                    ) : (
                        <table className="consent-list-table">
                            <thead>
                                <tr>
                                    <th>Company Name</th>
                                    <th>Submitted</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {submissions.map((sub) => (
                                    <tr
                                        key={sub.id}
                                        className="consent-list-row"
                                        onClick={() => onSelectSubmission(sub)}
                                    >
                                        <td>{getCompanyName(sub.submission_data)}</td>
                                        <td>{formatDate(sub.submitted_at)}</td>
                                        <td onClick={(e) => e.stopPropagation()}>
                                            <button
                                                className="delete-btn"
                                                onClick={() => onDelete(sub.id)}
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </>
    );
}

function pluginLabel(plugin) {
    if (!plugin) return '';
    const lower = plugin.toLowerCase();
    if (lower.includes('gravity')) return 'Gravity Forms';
    if (lower.includes('elementor')) return 'Elementor';
    if (lower.includes('cf7') || lower.includes('contact-form-7')) return 'Contact Form 7';
    return plugin;
}

export default Dashboard;
