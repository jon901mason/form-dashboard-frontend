import React, { useState } from 'react';
import axios from 'axios';
import './AddClient.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

function AddClient({ token, onClientAdded, onClose }) {
    const [name, setName] = useState('');
    const [wordpressUrl, setWordpressUrl] = useState('');

    const [createdClient, setCreatedClient] = useState(null); // store response so we can show API key
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = await axios.post(
                `${API_URL}/api/clients`,
                {
                    name,
                    wordpress_url: wordpressUrl,
                },
                { headers }
            );

            // Keep the created client so we can display its API key (if returned)
            setCreatedClient(response.data);

            // Let the dashboard refresh its client list
            onClientAdded(response.data);

            // Reset form inputs (but keep modal open so user can copy key)
            setName('');
            setWordpressUrl('');
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to add client');
        } finally {
            setLoading(false);
        }
    };

    const clientApiKey =
        createdClient?.client_api_key ||
        createdClient?.api_key ||
        createdClient?.apiKey ||
        '';

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(clientApiKey);
        } catch (e) {
            // fallback: do nothing (clipboard can fail depending on browser permissions)
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-box">
                <div className="modal-header">
                    <h2>Add New Client</h2>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>

                {error && <div className="error-message">{error}</div>}

                {/* If we successfully created a client, show the API key (so you can paste into WP plugin) */}
                {createdClient ? (
                    <div>
                        <div style={{ marginBottom: 12 }}>
                            <strong>Client created.</strong>
                            <div style={{ marginTop: 6, opacity: 0.9 }}>
                                Copy this API key into the WordPress plugin for this client site.
                            </div>
                        </div>

                        <div className="form-group">
                            <label>Client API Key</label>
                            <input type="text" value={clientApiKey || '(not returned by API)'} readOnly />
                        </div>

                        <div className="form-actions">
                            <button type="button" onClick={handleCopy} className="cancel-btn" disabled={!clientApiKey}>
                                Copy Key
                            </button>
                            <button type="button" onClick={onClose} className="submit-btn">
                                Done
                            </button>
                        </div>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label>Client Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g., Acme Corp"
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label>WordPress Site URL</label>
                            <input
                                type="url"
                                value={wordpressUrl}
                                onChange={(e) => setWordpressUrl(e.target.value)}
                                placeholder="https://example.com"
                                required
                            />
                        </div>

                        <div className="form-actions">
                            <button type="button" onClick={onClose} className="cancel-btn">
                                Cancel
                            </button>
                            <button type="submit" disabled={loading} className="submit-btn">
                                {loading ? 'Adding...' : 'Add Client'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}

export default AddClient;