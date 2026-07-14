import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import { Job, Image } from '../types';

export default function JobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState<Record<string, boolean>>({});
  const navigate = useNavigate();

  useEffect(() => {
    if (!jobId) return;

    fetchJobDetails();

    // Check if we need to poll
    const pollInterval = setInterval(() => {
      if (job && !hasActiveImages(job.images)) {
        clearInterval(pollInterval);
        return;
      }
      fetchJobDetails();
    }, 3000);

    return () => clearInterval(pollInterval);
  }, [jobId, job?.status]);

  async function fetchJobDetails() {
    try {
      const response = await api.get(`/jobs/${jobId}`);
      setJob(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch job details.');
    }
  }

  function hasActiveImages(images: Image[]) {
    return images.some((img) => img.status === 'PENDING' || img.status === 'PROCESSING');
  }

  async function handleRetry(imageId: string) {
    if (!jobId) return;
    setIsRetrying((prev) => ({ ...prev, [imageId]: true }));
    try {
      const response = await api.post(`/jobs/${jobId}/images/${imageId}/retry`);
      // Update image status in state
      if (job) {
        const updatedImages = job.images.map((img) =>
          img.id === imageId ? response.data : img
        );
        setJob({ ...job, images: updatedImages });
      }
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to retry image processing.');
    } finally {
      setIsRetrying((prev) => ({ ...prev, [imageId]: false }));
    }
  }

  if (error) {
    return (
      <div className="detail-container">
        <div className="error-banner">{error}</div>
        <button className="btn btn-secondary" onClick={() => navigate('/')}>
          Back to Dashboard
        </button>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="detail-container loading-state">
        <div className="spinner"></div>
        <p>Loading pipeline job details...</p>
      </div>
    );
  }

  return (
    <div className="detail-container">
      <header className="detail-header">
        <button className="btn btn-secondary btn-sm" onClick={() => navigate('/')}>
          ← Back to Dashboard
        </button>
        <div className="job-info-title">
          <h2>Job Details</h2>
          <span className="job-id-text">#{job.id}</span>
        </div>
        <div className="job-status-summary">
          <span className={`status-badge status-${job.status.toLowerCase()}`}>
            {job.status.replace('_', ' ')}
          </span>
          <span className="job-date">{new Date(job.createdAt).toLocaleString()}</span>
        </div>
      </header>

      <main className="detail-main">
        <div className="images-grid">
          {job.images.map((img) => (
            <div key={img.id} className={`image-card ${img.isFlagged ? 'flagged' : ''}`}>
              <div className="image-preview-container">
                <img
                  src={`/uploads/${img.storedPath.replace(/\\/g, '/')}`}
                  alt={img.originalName}
                  className="image-preview"
                />
                {img.isFlagged && (
                  <div className="safety-flag-badge">
                    ⚠️ FLAGGED: {img.flaggedCategory?.toUpperCase()}
                  </div>
                )}
              </div>

              <div className="image-card-details">
                <div className="image-card-header">
                  <span className="image-name" title={img.originalName}>
                    {img.originalName}
                  </span>
                  <span className={`status-badge status-${img.status.toLowerCase()}`}>
                    {img.status}
                  </span>
                </div>

                <div className="image-card-content">
                  {img.status === 'PENDING' && (
                    <div className="image-status-info">
                      <div className="spinner spinner-small"></div>
                      <span>Waiting in queue...</span>
                    </div>
                  )}

                  {img.status === 'PROCESSING' && (
                    <div className="image-status-info">
                      <div className="spinner spinner-small"></div>
                      <span>AI models running...</span>
                    </div>
                  )}

                  {img.status === 'FAILED' && (
                    <div className="failure-details">
                      <div className="failure-reason-code">
                        <strong>Reason:</strong> {img.failureReason}
                      </div>
                      <div className="failure-message">{img.failureMessage}</div>
                      <button
                        className="btn btn-primary btn-sm btn-retry"
                        onClick={() => handleRetry(img.id)}
                        disabled={isRetrying[img.id]}
                      >
                        {isRetrying[img.id] ? 'Queuing...' : 'Retry Processing'}
                      </button>
                    </div>
                  )}

                  {img.status === 'COMPLETED' && (
                    <div className="completed-results">
                      {img.caption && (
                        <div className="result-group">
                          <strong>Caption:</strong>
                          <p className="caption-text">"{img.caption}"</p>
                        </div>
                      )}

                      {img.labels && Array.isArray(img.labels) && img.labels.length > 0 && (
                        <div className="result-group">
                          <strong>Labels:</strong>
                          <div className="labels-list">
                            {img.labels.map((lbl: any, idx: number) => (
                              <span key={idx} className="label-tag" title={`Score: ${Math.round(lbl.score * 100)}%`}>
                                {lbl.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {img.safetyResult && (
                        <div className="result-group safety-result">
                          <strong>Content Safety:</strong>
                          <div className="safety-ratings">
                            {Object.entries(img.safetyResult.categories || {}).map(([cat, rating]) => (
                              <span
                                key={cat}
                                className={`safety-rating-tag rating-${rating.toLowerCase()}`}
                              >
                                {cat}: {rating}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
