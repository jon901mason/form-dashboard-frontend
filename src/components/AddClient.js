import React, { useState } from 'react';
import axios from 'axios';
import './AddClient.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

function AddClient({ token, onClientAdded, onClose }) {
    const [name, setName] = useState('');
    const [wordpressUrl, setWordpressUrl] = useState('');
    const [wordpressUsername, setWordpressUsername] = useState('');
    const [wordpressPassword, setWordpressPassword] = useState('');
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
                    wordpress_username: wordpressUsername,
                    wordpress_password: wordpressPassword,
                },
                { headers }
            );

            onClientAdded(response.data);
            setName('');
            setWordpressUrl('');
            setWordpressUsername('');
            setWordpressPassword('');
            onClose();
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to add client');
        } finally {
            setLoading(false);
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

                    <div className="form-group">
                        <label>WordPress Username</label>
                        <input
                            type="text"
                            value={wordpressUsername}
                            onChange={(e) => setWordpressUsername(e.target.value)}
                            placeholder="admin username"
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label>WordPress Password</label>
                        <input
                            type="password"
                            value={wordpressPassword}
                            onChange={(e) => setWordpressPassword(e.target.value)}
                            placeholder="admin password"
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
            </div>
        </div>
    );
}

export default AddClient;