import React, { useState } from 'react';
import axios from 'axios';
import './Login.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

function Login({ onLogin }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [isSignup, setIsSignup] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const endpoint = isSignup ? '/api/auth/signup' : '/api/auth/login';
            const data = isSignup
                ? { email, password, name }
                : { email, password };

            const response = await axios.post(`${API_URL}${endpoint}`, data);
            onLogin(response.data.token, response.data.user);
        } catch (err) {
            setError(err.response?.data?.error || 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-box">
                <h1>{isSignup ? 'Create Account' : 'Login'}</h1>

                {error && <div className="error-message">{error}</div>}

                <form onSubmit={handleSubmit}>
                    {isSignup && (
                        <div className="form-group">
                            <label>Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Your name"
                                required
                            />
                        </div>
                    )}

                    <div className="form-group">
                        <label>Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="your@email.com"
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label>Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    <button type="submit" disabled={loading}>
                        {loading ? 'Loading...' : (isSignup ? 'Sign Up' : 'Login')}
                    </button>
                </form>

                <div className="auth-toggle">
                    {isSignup ? (
                        <p>Already have an account? <button onClick={() => setIsSignup(false)} className="link-button">Login</button></p>
                    ) : (
                        <p>Don't have an account? <button onClick={() => setIsSignup(true)} className="link-button">Sign Up</button></p>
                    )}
                </div>
            </div>
        </div>
    );
}

export default Login;