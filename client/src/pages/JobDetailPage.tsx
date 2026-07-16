import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import { Job, Image } from '../types';
import ImagePreview from '../components/ImagePreview';
import { ArrowLeftIcon, AlertTriangleIcon } from '../components/Icons';

export default function JobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState<Record<string, boolean>>({});
  const [isRetryingAll, setIsRetryingAll] = useState(false);
  const navigate = useNavigate();

  const renderFailureMessage = (message: string | null) => {
    if (!message) return null;
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = message.split(urlRegex);
    return parts.map((part, index) => {
      if (urlRegex.test(part)) {
        return (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--color-primary)', textDecoration: 'underline', wordBreak: 'break-all' }}
          >
            {part}
          </a>
        );
      }
      return part;
    });
  };

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
      console.error('Individual retry error:', err);
      const errMsg = err.response?.data?.error || err.response?.statusText || err.message || 'Failed to retry image processing.';
      alert(errMsg);
    } finally {
      setIsRetrying((prev) => ({ ...prev, [imageId]: false }));
    }
  }

  async function handleRetryAllFailed() {
    if (!jobId) return;
    setIsRetryingAll(true);
    try {
      const response = await api.post(`/jobs/${jobId}/retry`);
      if (job) {
        const updatedImagesMap = new Map(response.data.images.map((img: any) => [img.id, img]));
        const updatedImages = job.images.map((img) =>
          updatedImagesMap.has(img.id) ? (updatedImagesMap.get(img.id) as Image) : img
        );
        setJob({ ...job, images: updatedImages });
      }
    } catch (err: any) {
      console.error('Batch retry error:', err);
      const errMsg = err.response?.data?.error || err.response?.statusText || err.message || 'Failed to retry failed images.';
      alert(errMsg);
    } finally {
      setIsRetryingAll(false);
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
        <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }} onClick={() => navigate('/')}>
          <ArrowLeftIcon />
          <span>Back to Dashboard</span>
        </button>
        <div className="job-info-title">
          <h2>Job Details</h2>
          <span className="job-id-text">#{job.id}</span>
        </div>
        <div className="job-status-summary" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {job.images.some((img) => img.status === 'FAILED') && (
            <button
              className="btn btn-primary btn-sm btn-retry-all"
              onClick={handleRetryAllFailed}
              disabled={isRetryingAll}
            >
              {isRetryingAll ? 'Retrying Failed...' : 'Retry Failed Images'}
            </button>
          )}
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
                <ImagePreview jobId={job.id} imageId={img.id} alt={img.originalName} />
                {img.isFlagged && (
                  <div className="safety-flag-badge" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <AlertTriangleIcon size="1.2em" />
                    <span>FLAGGED: {img.flaggedCategory?.toUpperCase()}</span>
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
                      <div className="failure-message">{renderFailureMessage(img.failureMessage)}</div>
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
