import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { Job, Notification } from '../types';

export default function Dashboard() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchJobs();
    fetchNotifications();

    const jobInterval = setInterval(fetchJobs, 5000);
    const notifInterval = setInterval(fetchNotifications, 10000);

    return () => {
      clearInterval(jobInterval);
      clearInterval(notifInterval);
    };
  }, []);

  async function fetchJobs() {
    try {
      const response = await api.get('/jobs');
      setJobs(response.data);
    } catch (err) {
      console.error('Failed to fetch jobs', err);
    }
  }

  async function fetchNotifications() {
    try {
      const response = await api.get('/notifications');
      setNotifications(response.data);
    } catch (err) {
      console.error('Failed to fetch notifications', err);
    }
  }

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  async function markNotificationAsRead(id: string) {
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
    } catch (err) {
      console.error('Failed to mark notification as read', err);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      validateAndAddFiles(Array.from(e.target.files));
    }
  }

  function validateAndAddFiles(files: File[]) {
    setUploadError(null);
    const validFiles: File[] = [];
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const maxSize = 5 * 1024 * 1024; // 5MB

    for (const file of files) {
      if (!allowedTypes.includes(file.type)) {
        setUploadError(`Unsupported format: ${file.name}. Only JPG, PNG, and WEBP are accepted.`);
        return;
      }
      if (file.size > maxSize) {
        setUploadError(`File too large: ${file.name}. Maximum size is 5MB.`);
        return;
      }
      validFiles.push(file);
    }

    setSelectedFiles((prev) => [...prev, ...validFiles]);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave() {
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      validateAndAddFiles(Array.from(e.dataTransfer.files));
    }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (selectedFiles.length === 0) return;

    setIsUploading(true);
    setUploadError(null);

    const formData = new FormData();
    selectedFiles.forEach((file) => {
      formData.append('images', file);
    });

    try {
      const response = await api.post('/jobs', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setSelectedFiles([]);
      fetchJobs();
      navigate(`/jobs/${response.data.job.id}`);
    } catch (err: any) {
      setUploadError(err.response?.data?.error || 'Failed to upload files.');
    } finally {
      setIsUploading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem('ampm_access_token');
    localStorage.removeItem('ampm_refresh_token');
    navigate('/login');
  }

  return (
    <div className="dashboard-layout">
      <header className="dashboard-header">
        <div className="header-brand">
          <span className="brand-icon">⚡</span>
          <h1>AMPM</h1>
        </div>
        <div className="header-actions">
          <div className="notification-wrapper">
            <button
              className={`notification-bell ${unreadCount > 0 ? 'has-unread' : ''}`}
              onClick={() => setShowNotifications(!showNotifications)}
              aria-label="Notifications"
            >
              🔔
              {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
            </button>
            {showNotifications && (
              <div className="notification-dropdown">
                <h3>Notifications</h3>
                {notifications.length === 0 ? (
                  <p className="no-notifications">No notifications yet</p>
                ) : (
                  <div className="notifications-list">
                    {notifications.map((n) => (
                      <div
                        key={n.id}
                        className={`notification-item ${n.isRead ? 'read' : 'unread'}`}
                        onClick={() => {
                          markNotificationAsRead(n.id);
                          if (n.jobId) navigate(`/jobs/${n.jobId}`);
                        }}
                      >
                        <div className="notification-title">{n.title}</div>
                        <div className="notification-message">{n.message}</div>
                        <div className="notification-time">
                          {new Date(n.createdAt).toLocaleTimeString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      <main className="dashboard-main">
        <section className="upload-section">
          <h2>New Job Upload</h2>
          <form onSubmit={handleUpload}>
            <div
              className={`upload-dropzone ${isDragging ? 'dragging' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                id="file-upload"
                style={{ display: 'none' }}
              />
              <label htmlFor="file-upload" className="dropzone-label">
                <span className="dropzone-icon">📤</span>
                <span className="dropzone-text">
                  Drag and drop files here, or <strong>browse</strong>
                </span>
                <span className="dropzone-subtext">JPG, PNG, WEBP only (Max 5MB per file)</span>
              </label>
            </div>

            {uploadError && <div className="error-banner">{uploadError}</div>}

            {selectedFiles.length > 0 && (
              <div className="selected-files-container">
                <h3>Selected Files ({selectedFiles.length})</h3>
                <div className="selected-files-list">
                  {selectedFiles.map((file, idx) => (
                    <div key={idx} className="selected-file-item">
                      <span className="file-name">{file.name}</span>
                      <span className="file-size">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                      <button
                        type="button"
                        className="btn-remove"
                        onClick={() => setSelectedFiles((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                <div className="upload-actions">
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={isUploading}
                  >
                    {isUploading ? 'Uploading & Enqueueing...' : 'Start Processing Pipeline'}
                  </button>
                </div>
              </div>
            )}
          </form>
        </section>

        <section className="jobs-section">
          <h2>Processing Jobs</h2>
          {jobs.length === 0 ? (
            <div className="empty-state">
              <span className="empty-state-icon">📂</span>
              <p>No media processing jobs yet. Upload files to get started!</p>
            </div>
          ) : (
            <div className="jobs-grid">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className="job-card"
                  onClick={() => navigate(`/jobs/${job.id}`)}
                >
                  <div className="job-card-header">
                    <span className="job-id">Job #{job.id.substring(0, 8)}</span>
                    <span className={`status-badge status-${job.status.toLowerCase()}`}>
                      {job.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="job-card-body">
                    <div className="job-meta-item">
                      <span className="meta-label">Images:</span>
                      <span className="meta-value">{job.imageCount}</span>
                    </div>
                    <div className="job-meta-item">
                      <span className="meta-label">Created:</span>
                      <span className="meta-value">
                        {new Date(job.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
