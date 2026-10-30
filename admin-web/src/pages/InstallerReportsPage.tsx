import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Download, Printer, Users } from 'lucide-react';
import html2pdf from 'html2pdf.js';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Earning, EarningStatus, EarningType, Job, TeamMember } from '../lib/types';

type Installer = Pick<TeamMember, 'id' | 'fullName' | 'role' | 'isActive' | 'additionalRoles'>;

interface InstallerReport {
  installer: Installer;
  jobs: Job[];
  earnings: Earning[];
  amounts: Record<EarningStatus, number>;
  typeAmounts: Record<EarningType, number>;
  clientCount: number;
}

const peso = (amount: number) => `₱${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const INSTALLER_REPORT_PRINT_STYLE = `
@media print {
  #installer-report-print {
    --text: #111827;
    --text-muted: #475569;
    --surface: #fff;
    --surface-secondary: #eff6ff;
    --border: #cbd5e1;
    --accent: #1d4ed8;
    --success: #15803d;
    background: #fff !important;
    color: #111827 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  #installer-report-print .card {
    background: #fff !important;
    color: #111827 !important;
    border: 1px solid #cbd5e1;
    box-shadow: none;
  }
  #installer-report-print .installer-report-card { border-top: 3px solid #2563eb; }
  #installer-report-print .installer-report-card h2 { color: #1e40af !important; }
  #installer-report-print .installer-report-types { border-color: #cbd5e1 !important; }
  #installer-report-print th {
    position: static;
    color: #fff !important;
    background: #1e40af !important;
    border-color: #1e40af !important;
  }
  #installer-report-print td { color: #111827 !important; }
  #installer-report-print tr:nth-child(even) td { background: #eff6ff !important; }
  #installer-report-print strong { color: #15803d; }
  .report-print-heading { display: block !important; }
  @page { margin: 12mm; }
}

.installer-report-export {
  --text: #111827;
  --text-muted: #475569;
  --surface: #fff;
  --surface-secondary: #eff6ff;
  --border: #cbd5e1;
  --accent: #1d4ed8;
  --success: #15803d;
  background: #fff !important;
  color: #111827 !important;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.installer-report-export .card {
  background: #fff !important;
  color: #111827 !important;
  border: 1px solid #cbd5e1 !important;
  box-shadow: none !important;
}
.installer-report-export .installer-report-card { border-top: 3px solid #2563eb !important; }
.installer-report-export .installer-report-card h2 { color: #1e40af !important; }
.installer-report-export .installer-report-types { border-color: #cbd5e1 !important; }
.installer-report-export th {
  position: static !important;
  color: #fff !important;
  background: #1e40af !important;
  border-color: #1e40af !important;
}
.installer-report-export td { color: #111827 !important; }
.installer-report-export tr:nth-child(even) td { background: #eff6ff !important; }
.installer-report-export strong { color: #15803d; }
@media print {
  body * { visibility: hidden; }
  #installer-report-print, #installer-report-print * { visibility: visible; }
  #installer-report-print {
    display: block !important;
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    z-index: 99999;
  }
  .report-print-heading { display: block !important; }
  @page { margin: 12mm; }
}
`;

function assignedInstallerIds(job: Job): string[] {
  if (job.installers && job.installers.length > 0) return job.installers.map((assignment) => assignment.user.id);
  return job.installerId ? [job.installerId] : [];
}

function buildInstallerReports(installers: Installer[], jobs: Job[], earnings: Earning[]): InstallerReport[] {
  return installers.map((installer) => {
    const installerJobs = jobs.filter((job) => assignedInstallerIds(job).includes(installer.id));
    const installerEarnings = earnings.filter((earning) => earning.userId === installer.id);
    const amounts: Record<EarningStatus, number> = { PENDING: 0, APPROVED: 0, PAID: 0 };
    const typeAmounts: Record<EarningType, number> = { INSTALLATION: 0, ACTIVATION: 0, BONUS: 0, COMMISSION: 0 };
    for (const earning of installerEarnings) {
      amounts[earning.status] += Number(earning.amount);
      typeAmounts[earning.type] += Number(earning.amount);
    }

    return {
      installer,
      jobs: installerJobs,
      earnings: installerEarnings,
      amounts,
      typeAmounts,
      clientCount: new Set(installerJobs.map((job) => job.clientId)).size,
    };
  });
}

function titleCase(value: string): string {
  return value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge badge-${status.toLowerCase()}`}>{titleCase(status)}</span>;
}

function Amount({ value, bold }: { value: number; bold?: boolean }) {
  return (
    <span style={{ color: value === 0 ? 'var(--text-muted)' : undefined, fontWeight: bold && value !== 0 ? 700 : undefined, fontVariantNumeric: 'tabular-nums' }}>
      {peso(value)}
    </span>
  );
}

export function InstallerReportsPage() {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [expandAll, setExpandAll] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  useEffect(() => {
    if (document.getElementById('installer-report-print-style')) return;
    const style = document.createElement('style');
    style.id = 'installer-report-print-style';
    style.textContent = INSTALLER_REPORT_PRINT_STYLE;
    document.head.appendChild(style);
    return () => {
      document.getElementById('installer-report-print-style')?.remove();
    };
  }, []);

  const installersQuery = useQuery({
    queryKey: ['installer-report', 'installers'],
    queryFn: async () => (await api.get<Installer[]>('/users', { params: { role: 'INSTALLER' } })).data,
  });
  const jobsQuery = useQuery({
    queryKey: ['installer-report', 'jobs'],
    queryFn: async () => (await api.get<Job[]>('/jobs')).data,
  });
  const earningsQuery = useQuery({
    queryKey: ['installer-report', 'earnings'],
    queryFn: async () => (await api.get<Earning[]>('/earnings')).data,
  });

  const reports = useMemo(
    () => buildInstallerReports(installersQuery.data ?? [], jobsQuery.data ?? [], earningsQuery.data ?? []),
    [installersQuery.data, jobsQuery.data, earningsQuery.data],
  );
  const filteredReports = useMemo(
    () => reports.filter((report) => report.installer.fullName.toLowerCase().includes(search.trim().toLowerCase())),
    [reports, search],
  );
  const totals = useMemo(() => filteredReports.reduce(
    (acc, report) => ({
      jobs: acc.jobs + report.jobs.length,
      completed: acc.completed + report.jobs.filter((job) => job.jobStatus === 'COMPLETED').length,
      pending: acc.pending + report.amounts.PENDING,
      approved: acc.approved + report.amounts.APPROVED,
      paid: acc.paid + report.amounts.PAID,
    }),
    { jobs: 0, completed: 0, pending: 0, approved: 0, paid: 0 },
  ), [filteredReports]);
  const allOpen = filteredReports.length > 0 && filteredReports.every((report) => expanded.has(report.installer.id));
  const isLoading = installersQuery.isLoading || jobsQuery.isLoading || earningsQuery.isLoading;
  const hasError = installersQuery.isError || jobsQuery.isError || earningsQuery.isError;

  // Installers start collapsed; a search or an export forces every row open so matches/output stay complete.
  const isExpanded = (id: string) => expandAll || !!search.trim() || expanded.has(id);
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

  const handlePrint = async () => {
    setExpandAll(true);
    await nextFrame();
    await nextFrame();
    window.print();
    setExpandAll(false);
  };

  const handleDownload = async () => {
    const reportElement = document.getElementById('installer-report-print');
    const printHeading = reportElement?.querySelector<HTMLElement>('.report-print-heading');
    if (!reportElement) {
      setDownloadError('The report is not ready to download. Please try again.');
      return;
    }

    setIsDownloading(true);
    setDownloadError('');
    setExpandAll(true);
    await nextFrame();
    await nextFrame();
    const date = new Date().toISOString().slice(0, 10);
    reportElement.classList.add('installer-report-export');
    if (printHeading) printHeading.style.display = 'block';
    try {
      await html2pdf()
        .set({
          margin: [10, 10] as [number, number],
          filename: `installer-report-${date}.pdf`,
          image: { type: 'jpeg' as const, quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, logging: false },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' as const },
        })
        .from(reportElement)
        .save();
    } catch (error) {
      setDownloadError(error instanceof Error ? `Could not create the PDF: ${error.message}` : 'Could not create the PDF.');
    } finally {
      reportElement.classList.remove('installer-report-export');
      if (printHeading) printHeading.style.display = 'none';
      setIsDownloading(false);
      setExpandAll(false);
    }
  };

  return (
    <div className="installer-report-page">
      <div className="report-screen-only" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <div>
          <Link to="/reports" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', marginBottom: '0.5rem' }}>
            <ArrowLeft size={15} /> All reports
          </Link>
          <h1 style={{ margin: 0 }}>Installer Report</h1>
          <p style={{ color: 'var(--text-muted)', margin: '0.35rem 0 0' }}>Installer assignments, assigned clients, job progress, and recorded earnings.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary" disabled={isLoading || hasError || filteredReports.length === 0} onClick={() => void handlePrint()}>
            <Printer size={16} /> Print
          </button>
          <button type="button" className="btn btn-primary" disabled={isDownloading || isLoading || hasError || filteredReports.length === 0} onClick={() => void handleDownload()}>
            <Download size={16} /> {isDownloading ? 'Preparing PDF…' : 'Download PDF'}
          </button>
        </div>
      </div>

      {downloadError && <p className="error-text report-screen-only" role="alert">{downloadError}</p>}
      {isLoading && <p>Loading installer report…</p>}
      {hasError && <p className="error-text" role="alert">Failed to load installer report data. Please refresh and try again.</p>}

      {!isLoading && !hasError && (
        <>
          <div className="report-screen-only" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <input
              id="installer-report-search"
              className="input"
              type="search"
              aria-label="Search installers"
              placeholder="Search installer name"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              style={{ maxWidth: 320 }}
            />
            <button
              type="button"
              className="btn btn-secondary"
              disabled={filteredReports.length === 0}
              onClick={() => setExpanded(allOpen ? new Set() : new Set(filteredReports.map((report) => report.installer.id)))}
            >
              {allOpen ? 'Collapse all' : 'Expand all'}
            </button>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginLeft: 'auto' }}>
              {filteredReports.length} installer{filteredReports.length === 1 ? '' : 's'} · {totals.jobs} job{totals.jobs === 1 ? '' : 's'} · {peso(totals.pending + totals.approved + totals.paid)} total earnings
            </span>
          </div>

          {reports.length === 0 ? (
            <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Users size={28} style={{ marginBottom: '0.5rem' }} />
              <p style={{ margin: 0 }}>No installers found.</p>
            </div>
          ) : (
            <div id="installer-report-print">
              <div className="report-print-heading" style={{ display: 'none' }}>
                <h1 style={{ margin: 0 }}>Installer Report</h1>
                <p style={{ margin: '0.25rem 0 1rem' }}>Generated {new Date().toLocaleDateString()}</p>
              </div>
              <div className="card" style={{ overflowX: 'auto', padding: 0 }}>
                <table style={{ fontSize: '0.85rem', width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '0.45rem', textAlign: 'left' }}>Installer</th>
                      <th style={{ padding: '0.45rem', textAlign: 'left' }}>Status</th>
                      <th style={{ padding: '0.45rem', textAlign: 'right' }}>Clients</th>
                      <th style={{ padding: '0.45rem', textAlign: 'right' }}>Jobs</th>
                      <th style={{ padding: '0.45rem', textAlign: 'right' }}>Completed</th>
                      <th style={{ padding: '0.45rem', textAlign: 'right' }}>Pending</th>
                      <th style={{ padding: '0.45rem', textAlign: 'right' }}>Approved</th>
                      <th style={{ padding: '0.45rem', textAlign: 'right' }}>Paid</th>
                      <th style={{ padding: '0.45rem', textAlign: 'right' }}>Total earnings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReports.map((report) => {
                      const open = isExpanded(report.installer.id);
                      const total = report.amounts.PENDING + report.amounts.APPROVED + report.amounts.PAID;
                      return (
                        <Fragment key={report.installer.id}>
                          <tr style={{ background: 'var(--bg)' }}>
                            <td style={{ padding: '0.6rem 0.75rem' }}>
                              <button
                                type="button"
                                onClick={() => toggle(report.installer.id)}
                                aria-expanded={open}
                                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', textAlign: 'left', fontWeight: 700, color: 'var(--accent)' }}
                              >
                                <span style={{ display: 'inline-block', width: '1.1rem' }}>{open ? '▾' : '▸'}</span>
                                {report.installer.fullName}
                              </button>
                            </td>
                            <td style={{ padding: '0.6rem 0.75rem' }}><StatusBadge status={report.installer.isActive ? 'ACTIVE' : 'SUSPENDED'} /></td>
                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', color: report.clientCount === 0 ? 'var(--text-muted)' : undefined }}>{report.clientCount}</td>
                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', color: report.jobs.length === 0 ? 'var(--text-muted)' : undefined }}>{report.jobs.length}</td>
                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right' }}>{report.jobs.filter((job) => job.jobStatus === 'COMPLETED').length}</td>
                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', whiteSpace: 'nowrap' }}><Amount value={report.amounts.PENDING} /></td>
                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', whiteSpace: 'nowrap' }}><Amount value={report.amounts.APPROVED} /></td>
                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', whiteSpace: 'nowrap' }}><Amount value={report.amounts.PAID} /></td>
                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', whiteSpace: 'nowrap' }}><Amount value={total} bold /></td>
                          </tr>
                          {open && (
                            <tr>
                              <td colSpan={9} style={{ padding: '0.5rem 0.75rem 1rem 2rem', background: 'var(--surface-secondary, transparent)' }}>
                                <table style={{ fontSize: '0.78rem', width: '100%', marginBottom: '0.75rem' }}>
                                  <thead>
                                    <tr>
                                      <th style={{ padding: '0.35rem', textAlign: 'left' }}>Client</th>
                                      <th style={{ padding: '0.35rem', textAlign: 'left' }}>Scheduled</th>
                                      <th style={{ padding: '0.35rem', textAlign: 'left' }}>Status</th>
                                      <th style={{ padding: '0.35rem', textAlign: 'left' }}>Notes</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {report.jobs.map((job) => (
                                      <tr key={job.id}>
                                        <td style={{ padding: '0.35rem' }}>{job.client?.businessName ?? 'Client name unavailable'}</td>
                                        <td style={{ padding: '0.35rem', whiteSpace: 'nowrap' }}>{new Date(job.scheduleDate).toLocaleDateString()}</td>
                                        <td style={{ padding: '0.35rem' }}><StatusBadge status={job.jobStatus} /></td>
                                        <td style={{ padding: '0.35rem' }}>{job.remarks || '—'}</td>
                                      </tr>
                                    ))}
                                    {report.jobs.length === 0 && (
                                      <tr><td colSpan={4} style={{ padding: '0.5rem 0.35rem', color: 'var(--text-muted)' }}>No installation jobs assigned.</td></tr>
                                    )}
                                  </tbody>
                                </table>
                                <table style={{ fontSize: '0.78rem', width: '100%' }}>
                                  <thead>
                                    <tr>
                                      <th style={{ padding: '0.35rem', textAlign: 'left' }}>Date</th>
                                      <th style={{ padding: '0.35rem', textAlign: 'left' }}>Client</th>
                                      <th style={{ padding: '0.35rem', textAlign: 'left' }}>Type</th>
                                      <th style={{ padding: '0.35rem', textAlign: 'left' }}>Status</th>
                                      <th style={{ padding: '0.35rem', textAlign: 'right' }}>Amount</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {[...report.earnings]
                                      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                                      .map((earning) => (
                                        <tr key={earning.id}>
                                          <td style={{ padding: '0.35rem', whiteSpace: 'nowrap' }}>{new Date(earning.createdAt).toLocaleDateString()}</td>
                                          <td style={{ padding: '0.35rem' }}>{earning.job?.client?.businessName ?? earning.note ?? '—'}</td>
                                          <td style={{ padding: '0.35rem' }}>{titleCase(earning.type)}</td>
                                          <td style={{ padding: '0.35rem' }}><StatusBadge status={earning.status} /></td>
                                          <td style={{ padding: '0.35rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{peso(Number(earning.amount))}</td>
                                        </tr>
                                      ))}
                                    {report.earnings.length === 0 && (
                                      <tr><td colSpan={5} style={{ padding: '0.5rem 0.35rem', color: 'var(--text-muted)' }}>No earnings recorded.</td></tr>
                                    )}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                    {filteredReports.length > 0 && (
                      <tr style={{ borderTop: '2px solid var(--border)' }}>
                        <td colSpan={4} style={{ padding: '0.6rem 0.75rem', fontWeight: 700 }}>Total</td>
                        <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontWeight: 700 }}>{totals.completed}</td>
                        <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right' }}><Amount value={totals.pending} bold /></td>
                        <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right' }}><Amount value={totals.approved} bold /></td>
                        <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right' }}><Amount value={totals.paid} bold /></td>
                        <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right' }}><Amount value={totals.pending + totals.approved + totals.paid} bold /></td>
                      </tr>
                    )}
                    {filteredReports.length === 0 && (
                      <tr><td colSpan={9} style={{ padding: '0.75rem 0.45rem', color: 'var(--text-muted)' }}>No installers match your search.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

