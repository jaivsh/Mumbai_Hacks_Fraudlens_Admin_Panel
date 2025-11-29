import React from 'react';

const RecentReportsTable = ({ reports = [], onView, onDownload }) => {
  return (
    <div>
      <header className="scribe-section-header">
        <p className="scribe-eyebrow">Recently Generated Reports</p>
        <h2>Recently Generated Reports</h2>
        <p>Track the latest artifacts emitted by the Scribe agent.</p>
      </header>

      <div className="scribe-table-wrapper">
        <table className="scribe-table">
          <thead>
            <tr>
              <th>Report ID</th>
              <th>Type</th>
              <th>Incident</th>
              <th>Generated On</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {reports.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <p className="scribe-placeholder">No reports generated yet.</p>
                </td>
              </tr>
            ) : (
              reports.slice(0, 10).map(report => (
                <tr key={report.id}>
                  <td>{report.id}</td>
                  <td>{report.type}</td>
                  <td>{report.incidentId || '—'}</td>
                  <td>{report.generatedOn}</td>
                  <td className="scribe-table-actions">
                    <button className="scribe-btn outline" onClick={() => onView(report.id)}>
                      View
                    </button>
                    <button className="scribe-btn secondary" onClick={() => onDownload(report.id)}>
                      Download
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RecentReportsTable;

