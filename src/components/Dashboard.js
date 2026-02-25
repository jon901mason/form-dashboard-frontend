import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import './Dashboard.css';
import AddClient from './AddClient';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

function Dashboard({ user, token, onLogout }) {
    const [clients, setClients] = useState([]);
    const [selectedClient, setSelectedClient] = useState(null);
    const [forms, setForms] = useState([]);
    const [selectedForm, setSelectedForm] = useState(null);
    const [submissions, setSubmissions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showAddClient, setShowAddClient] = useState(false);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const headers = useMemo(() => ({
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
    }), [token]);

    const fetchClients = useCallback(async () => {
        try {
            setLoading(true);
            const response = await axios.get(`${API_URL}/api/clients`, { headers });
            setClients(response.data);
        } catch (err) {
            setError('Failed to load clients');
        } finally {
            setLoading(false);
        }
    }, [headers]);

    // Fetch clients on mount
    useEffect(() => {
        fetchClients();
    }, [fetchClients]);

    const handleClientSelect = async (client) => {
        setSelectedClient(client);
        setSelectedForm(null);
        setSubmissions([]);

        try {
            setLoading(true);
            const response = await axios.get(
                `${API_URL}/api/forms/client/${client.id}`,
                { headers }
            );
            setForms(response.data);
        } catch (err) {
            setError('Failed to load forms');
        } finally {
            setLoading(false);
        }
    };

    const handleFormSelect = async (form) => {
        setSelectedForm(form);

        try {
            setLoading(true);
            const response = await axios.get(
                `${API_URL}/api/forms/${form.id}/submissions`,
                { headers }
            );
            setSubmissions(response.data);
        } catch (err) {
            setError('Failed to load submissions');
        } finally {
            setLoading(false);
        }
    };

    const getFilteredSubmissions = () => {
        if (!startDate && !endDate) {
            return submissions;
        }

        return submissions.filter(sub => {
            const subDate = new Date(sub.submitted_at);
            const start = startDate ? new Date(startDate) : new Date('1970-01-01');
            const end = endDate ? new Date(endDate) : new Date('2099-12-31');

            // Set end date to end of day
            end.setHours(23, 59, 59, 999);

            return subDate >= start && subDate <= end;
        });
    };

    const downloadCSV = () => {
        const filteredSubmissions = getFilteredSubmissions();

        if (filteredSubmissions.length === 0) {
            alert('No submissions to download');
            return;
        }

        // Prepare CSV data
        const csvHeaders = Object.keys(filteredSubmissions[0].submission_data);
        const rows = filteredSubmissions.map(sub =>
            csvHeaders.map(header => {
                const val = sub.submission_data[header];
                // Escape quotes in values
                const escaped = String(val).replace(/"/g, '""');
                return `"${escaped}"`;
            }).join(',')
        );
        const csv = [csvHeaders.join(','), ...rows].join('\n');

        // Download
        const element = document.createElement('a');
        element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(csv));
        element.setAttribute('download', `${selectedForm.form_name}.csv`);
        element.style.display = 'none';
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    };

    const handleClientAdded = (newClient) => {
        setClients([...clients, newClient]);
    };

    const filteredSubmissions = getFilteredSubmissions();

    return (
        <div className="dashboard">
            <header className="dashboard-header">
                <h1>Form Submission Dashboard</h1>
                <div className="user-info">
                    <span>Welcome, {user?.name || user?.email}</span>
                    <button onClick={onLogout} className="logout-btn">Logout</button>
                </div>
            </header>

            <div className="dashboard-content">
                {error && <div className="error-message">{error}</div>}

                <div className="clients-section">
                    <h2>Clients</h2>
                    <button onClick={() => setShowAddClient(true)} className="add-client-btn">
                        + Add Client
                    </button>
                    {loading && <p>Loading...</p>}
                    <div className="clients-list">
                        {clients.length === 0 ? (
                            <p className="empty-state">No clients yet. Add one to get started!</p>
                        ) : (
                            clients.map(client => (
                                <button
                                    key={client.id}
                                    className={`client-btn ${selectedClient?.id === client.id ? 'active' : ''}`}
                                    onClick={() => handleClientSelect(client)}
                                >
                                    {client.name}
                                </button>
                            ))
                        )}
                    </div>
                </div>

                {selectedClient && (
                    <div className="forms-section">
                        <h2>Forms for {selectedClient.name}</h2>
                        {loading && <p>Loading...</p>}
                        <div className="forms-list">
                            {forms.length === 0 ? (
                                <p className="empty-state">No forms found.</p>
                            ) : (
                                forms.map(form => (
                                    <button
                                        key={form.id}
                                        className={`form-btn ${selectedForm?.id === form.id ? 'active' : ''}`}
                                        onClick={() => handleFormSelect(form)}
                                    >
                                        {form.form_name} ({form.form_plugin})
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {selectedForm && (
                    <div className="submissions-section">
                        <h2>Submissions for {selectedForm.form_name}</h2>

                        <div className="filter-section">
                            <div className="date-range">
                                <div className="date-input">
                                    <label>From</label>
                                    <input
                                        type="date"
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                    />
                                </div>
                                <div className="date-input">
                                    <label>To</label>
                                    <input
                                        type="date"
                                        value={endDate}
                                        onChange={(e) => setEndDate(e.target.value)}
                                    />
                                </div>
                            </div>
                            <button onClick={() => { setStartDate(''); setEndDate(''); }} className="reset-btn">
                                Clear Dates
                            </button>
                            <button onClick={downloadCSV} className="download-btn">
                                Download as CSV
                            </button>
                        </div>

                        <div className="submission-count">
                            Showing {filteredSubmissions.length} of {submissions.length} submissions
                        </div>

                        {filteredSubmissions.length === 0 ? (
                            <p className="empty-state">No submissions found</p>
                        ) : (
                            <div className="submissions-table">
                                <table>
                                    <thead>
                                        <tr>
                                            {Object.keys(filteredSubmissions[0].submission_data).map(key => (
                                                <th key={key}>{key}</th>
                                            ))}
                                            <th>Submitted</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredSubmissions.map(sub => (
                                            <tr key={sub.id}>
                                                {Object.values(sub.submission_data).map((val, idx) => (
                                                    <td key={idx}>{String(val).substring(0, 50)}</td>
                                                ))}
                                                <td>{new Date(sub.submitted_at).toLocaleDateString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {showAddClient && (
                <AddClient
                    token={token}
                    onClientAdded={handleClientAdded}
                    onClose={() => setShowAddClient(false)}
                />
            )}
        </div>
    );
}

export default Dashboard;