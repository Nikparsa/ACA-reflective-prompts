import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';
axios.defaults.baseURL = API_BASE_URL;

const NAV_ITEMS = [
  { id: 'assignments', label: 'Assignments', description: 'Browse and submit coursework', roles: ['student', 'teacher'] },
  { id: 'submissions', label: 'My Submissions', description: 'Track feedback in real-time', roles: ['student'] },
  { id: 'teacher', label: 'Teacher Center', description: 'Manage classes and insights', roles: ['teacher'] }
];

const GRADE_BANDS = [
  { min: 90, label: 'Excellent', className: 'status-grade-excellent' },
  { min: 80, label: 'Good', className: 'status-grade-good' },
  { min: 65, label: 'Satisfactory', className: 'status-grade-satisfactory' },
  { min: 50, label: 'Sufficient', className: 'status-grade-sufficient' },
  { min: 0, label: 'Insufficient', className: 'status-grade-insufficient' }
];

function getGradeInfo(score) {
  if (score === undefined || score === null) {
    return null;
  }

  const rawPercent = score * 100;
  const percent = Math.round(rawPercent);
  for (const band of GRADE_BANDS) {
    if (rawPercent >= band.min) {
      return { ...band, percent };
    }
  }
  return null;
}

function getSubmissionStatusInfo(submission) {
  if (!submission) {
    return { label: 'Unknown', className: 'status-default' };
  }

  if (submission.status === 'queued' || submission.status === 'processing') {
    return { label: 'In review', className: 'status-queued' };
  }

  // If status is 'completed' and score exists, show grade
  if (submission.status === 'completed') {
    const gradeInfo = getGradeInfo(submission.score);
    if (gradeInfo) {
      return gradeInfo;
    }
    // If completed but no score yet, show "In review"
    return { label: 'In review', className: 'status-queued' };
  }

  // For failed status, check if we have a score (partial completion)
  // IMPORTANT: Score 0 is valid and should show grade, not just "Failed"
  if (submission.status === 'failed') {
    // Check if score exists (can be 0, which is valid)
    if (submission.score !== undefined && submission.score !== null) {
      const gradeInfo = getGradeInfo(submission.score);
      if (gradeInfo) {
        return gradeInfo;
      }
    }
    // Only show "Failed" if no score at all
    return { label: 'Failed', className: 'status-grade-insufficient' };
  }

  // Check for grade info for any other status
  const gradeInfo = getGradeInfo(submission.score);
  if (gradeInfo) {
    return gradeInfo;
  }

  // Default: show status as-is
  if (submission.status) {
    const statusLabels = {
      'queued': 'In review',
      'processing': 'In review',
      'completed': 'Completed',
      'failed': 'Failed'
    };
    return { 
      label: statusLabels[submission.status] || submission.status, 
      className: 'status-default' 
    };
  }

  return { label: 'Unknown', className: 'status-default' };
}

function App() {
  const [user, setUser] = useState(null);
  const [activeSection, setActiveSection] = useState('assignments');
  const [assignments, setAssignments] = useState([]);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [showCreateAssignment, setShowCreateAssignment] = useState(false);
  const [createAssignmentForm, setCreateAssignmentForm] = useState({
    slug: '',
    title: '',
    description: '',
    details: ''
  });
  const [testFile, setTestFile] = useState(null);
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [reflections, setReflections] = useState([]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');

    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }

    if (token && storedUser) {
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);
      setActiveSection(parsedUser.role === 'teacher' ? 'teacher' : 'assignments');
      hydrateData(parsedUser);
    }
  }, []);

  useEffect(() => {
    if (user) {
      hydrateData();
      
      // Auto-refresh submissions every 5 seconds when user is on submissions tab
      // This ensures grades appear as soon as they're ready
      const intervalId = setInterval(() => {
        if (activeSection === 'submissions' || activeSection === 'teacher') {
          axios.get('/submissions').then(r => setSubmissions(r.data)).catch(() => {});
          if (user.role === 'teacher') {
            axios.get('/reflections').then(r => setReflections(r.data)).catch(() => {});
          }
        }
      }, 5000);
      
      return () => clearInterval(intervalId);
    }
  }, [user, activeSection]);

  const hydrateData = async (userOverride = null) => {
    try {
      const u = userOverride || user;
      const reqs = [
        axios.get('/assignments').catch(err => {
          console.error('Failed to load assignments:', err.response?.data || err.message);
          return { data: [] };
        }),
        axios.get('/submissions').catch(() => ({ data: [] }))
      ];
      if (u?.role === 'teacher') reqs.push(axios.get('/reflections').catch(() => ({ data: [] })));
      const res = await Promise.all(reqs);
      const [assignmentsResponse, submissionsResponse, reflectionsResponse] = res;
      setAssignments(assignmentsResponse.data || []);
      setSubmissions(submissionsResponse.data || []);
      if (u?.role === 'teacher' && reflectionsResponse?.data) setReflections(reflectionsResponse.data);
      if (!selectedAssignment && assignmentsResponse.data && assignmentsResponse.data.length) {
        setSelectedAssignment(assignmentsResponse.data[0]);
      }
      // Log if no assignments found
      if (!assignmentsResponse.data || assignmentsResponse.data.length === 0) {
        console.warn('No assignments found. User might not be authenticated or database is empty.');
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      setAssignments([]);
      setSubmissions([]);
    }
  };

  const login = async (email, password) => {
    setLoading(true);
    try {
      const { data } = await axios.post('/auth/login', { email, password });
      const { token, user: userData } = data;

      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(userData));
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

      setUser(userData);
      setActiveSection('assignments');
      setStatusMessage({ type: 'success', text: `Welcome back, ${userData.email.split('@')[0]}!` });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.response?.data?.error || 'Login failed' };
    } finally {
      setLoading(false);
    }
  };

  const register = async (email, password, role) => {
    setLoading(true);
    try {
      const { data } = await axios.post('/auth/register', { email, password, role });
      const { token, user: userData } = data;

      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(userData));
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

      setUser(userData);
      setActiveSection('assignments');
      setStatusMessage({ type: 'success', text: 'Your account is ready. Explore your dashboard!' });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.response?.data?.error || 'Registration failed' };
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    delete axios.defaults.headers.common['Authorization'];
    setUser(null);
    setAssignments([]);
    setSubmissions([]);
    setAssignmentTemplates([]);
    setShowCreateAssignment(false);
    setActiveSection('assignments');
  };
// Step 2: Frontend sends file to backend
  const submitAssignment = async (assignmentId, file) => {
    setLoading(true);
    setStatusMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('assignmentId', assignmentId);

      const { data } = await axios.post('/submissions', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      // Reload submissions from backend to get the real data
      const submissionsResponse = await axios.get('/submissions').catch(() => ({ data: [] }));
      setSubmissions(submissionsResponse.data);
      setStatusMessage({ type: 'success', text: 'Submission received. We will notify you once grading is complete.' });
      return { success: true, submissionId: data.submissionId, assignmentId: parseInt(assignmentId) };
    } catch (error) {
      const message = error.response?.data?.error || 'Submission failed. Please try again.';
      setStatusMessage({ type: 'error', text: message });
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  };

  const openCreateAssignmentModal = () => {
    setCreateAssignmentForm({
      slug: '',
      title: '',
      description: '',
      details: ''
    });
    setTestFile(null);
    setShowCreateAssignment(true);
  };

  const closeCreateAssignmentModal = () => {
    setShowCreateAssignment(false);
    setCreateAssignmentForm({
      slug: '',
      title: '',
      description: '',
      details: ''
    });
    setTestFile(null);
  };

  const handleAssignmentFieldChange = (field, value) => {
    setCreateAssignmentForm((prev) => ({ ...prev, [field]: value }));
  };

  const createAssignment = async (event) => {
    event.preventDefault();
    const trimmedSlug = createAssignmentForm.slug.trim();
    if (!trimmedSlug || !createAssignmentForm.title.trim()) {
      setStatusMessage({ type: 'error', text: 'Slug and title are required.' });
      return;
    }

    if (!testFile) {
      setStatusMessage({ type: 'error', text: 'Please upload a test file.' });
      return;
    }

    setSavingAssignment(true);
    setStatusMessage(null);
    try {
      const payload = new FormData();
      payload.append('slug', trimmedSlug);
      payload.append('title', createAssignmentForm.title.trim());
      payload.append('description', createAssignmentForm.description);
      payload.append('details', createAssignmentForm.details);
      payload.append('testFile', testFile);

      await axios.post('/assignments', payload, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      await hydrateData();
      setStatusMessage({ type: 'success', text: 'Assignment created successfully.' });
      closeCreateAssignmentModal();
    } catch (error) {
      const message = error.response?.data?.error || 'Failed to create assignment.';
      setStatusMessage({ type: 'error', text: message });
    } finally {
      setSavingAssignment(false);
    }
  };

  const cancelSubmissionWithReflection = async (submissionId) => {
    await axios.delete(`/submissions/${submissionId}/cancel`);
    const submissionsResponse = await axios.get('/submissions').catch(() => ({ data: [] }));
    setSubmissions(submissionsResponse.data || []);
    setStatusMessage({
      type: 'info',
      text: 'Submission was closed and removed. It is not visible in dashboards.'
    });
  };


  if (!user) {
    return (
      <AuthLayout>
        <AuthHero />
        <AuthPanel onLogin={login} onRegister={register} loading={loading} />
      </AuthLayout>
    );
  }

  const availableSections = NAV_ITEMS.filter((item) => item.roles.includes(user.role));

  return (
    <>
      <AppLayout
        user={user}
        activeSection={activeSection}
        onChangeSection={setActiveSection}
        onLogout={logout}
        navItems={availableSections}
      >
      {statusMessage && (
        <MessageBanner type={statusMessage.type} onClose={() => setStatusMessage(null)}>
          {statusMessage.text}
        </MessageBanner>
      )}

      {activeSection === 'assignments' && (
        <AssignmentsSection
          assignments={assignments}
          selectedAssignment={selectedAssignment}
          onSelectAssignment={setSelectedAssignment}
          onSubmit={submitAssignment}
          loading={loading}
          user={user}
          onCreateAssignment={openCreateAssignmentModal}
          submissions={submissions}
          onSubmitReflection={async (data) => {
            const res = await axios.post('/reflections', data);
            return res.data;
          }}
          onCancelPendingSubmission={cancelSubmissionWithReflection}
        />
      )}

      {activeSection === 'submissions' && (
        <SubmissionsSection
          submissions={submissions}
          assignments={assignments}
          onSubmitReflection={async (data) => {
            const res = await axios.post('/reflections', data);
            return res.data;
          }}
        />
      )}

      {activeSection === 'teacher' && user.role === 'teacher' && (
        <TeacherSection
          assignments={assignments}
          submissions={submissions}
          reflections={reflections}
          onRefreshReflections={() => axios.get('/reflections').then(r => setReflections(r.data)).catch(() => {})}
        />
      )}
      </AppLayout>
      {showCreateAssignment && (
        <CreateAssignmentModal
          form={createAssignmentForm}
          onChangeField={handleAssignmentFieldChange}
          onSelectFile={setTestFile}
          testFile={testFile}
          onClose={closeCreateAssignmentModal}
          onSubmit={createAssignment}
          saving={savingAssignment}
        />
      )}
    </>
  );
}

function AuthLayout({ children }) {
  return (
    <div className="auth-shell">
      <div className="auth-wrapper">
        {children}
      </div>
    </div>
  );
}

function AuthHero() {
  return (
    <div className="auth-hero">
      <div>
        <span className="badge badge-primary">ACA Platform</span>
        <h1>Learning reimagined for modern teams.</h1>
        <p>
          Deliver rich assignments, streamline submissions, and give actionable feedback—
          on a platform built for ambitious educators and students.
        </p>
      </div>
      <div className="hero-illustration">
        <div className="hero-card">
          <strong>Automated Grading</strong>
          <p>Faster reviews with detailed analytics and targeted feedback.</p>
        </div>
        <div className="hero-card secondary">
          <strong>Real-time Insights</strong>
          <p>Track class progress and performance in a single dashboard.</p>
        </div>
      </div>
    </div>
  );
}

function AuthPanel({ onLogin, onRegister, loading }) {
  const [mode, setMode] = useState('login');

  const copy = mode === 'login'
    ? {
        title: 'Welcome to ACA',
        subtitle: 'Sign in to continue or create a new account to get started.'
      }
    : {
        title: 'Create your ACA account',
        subtitle: 'Set up your workspace and start collaborating with your cohort.'
      };

  return (
    <div className="auth-card">
      <div className="auth-tabs">
        <button
          type="button"
          className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
          onClick={() => setMode('login')}
        >
          Sign in
        </button>
        <button
          type="button"
          className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
          onClick={() => setMode('register')}
        >
          Create account
        </button>
      </div>

      <div className="auth-card-body">
        <h2>{copy.title}</h2>
        <p>{copy.subtitle}</p>

        {mode === 'login' ? (
          <LoginForm onLogin={onLogin} loading={loading} />
        ) : (
          <RegisterForm onRegister={onRegister} loading={loading} />
        )}
      </div>
    </div>
  );
}

function LoginForm({ onLogin, loading }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);

    const result = await onLogin(email, password);
    if (!result.success) {
      setError(result.error);
    }
  };

  return (
    <form className="form-grid" onSubmit={handleSubmit} noValidate>
      <div>
        <label>Email</label>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@academy.com"
          autoComplete="username"
          required
        />
      </div>
      <div>
        <label>Password</label>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="••••••••"
          autoComplete="current-password"
          required
        />
      </div>
      {error && <p className="form-error">{error}</p>}
      <PrimaryButton type="submit" disabled={loading}>
        {loading ? 'Signing in…' : 'Sign in'}
      </PrimaryButton>
    </form>
  );
}

function RegisterForm({ onRegister, loading }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('student');
  const [error, setError] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);

    const result = await onRegister(email, password, role);
    if (!result.success) {
      setError(result.error);
    }
  };

  return (
    <form className="form-grid" onSubmit={handleSubmit} noValidate>
      <div>
        <label>Email</label>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="your.name@academy.com"
          autoComplete="email"
          required
        />
      </div>
      <div>
        <label>Password</label>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Create a strong password"
          autoComplete="new-password"
          required
        />
      </div>
      <div>
        <label>Role</label>
        <select value={role} onChange={(event) => setRole(event.target.value)}>
          <option value="student">Student</option>
          <option value="teacher">Teacher</option>
        </select>
      </div>
      {error && <p className="form-error">{error}</p>}
      <PrimaryButton type="submit" disabled={loading}>
        {loading ? 'Creating…' : 'Create account'}
      </PrimaryButton>
    </form>
  );
}

function AppLayout({ user, activeSection, navItems, onChangeSection, onLogout, children }) {
  const activeItem = navItems.find((item) => item.id === activeSection);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <div className="brand-logo">ACA</div>
          <div className="brand-copy">
            <strong>Automated Code Assessment</strong>
            <span>Learning Suite</span>
          </div>
        </div>
        <nav className="top-tabs">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`top-tab ${activeSection === item.id ? 'active' : ''}`}
              onClick={() => onChangeSection(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="header-actions">
          <span className="user-chip">{user.email}</span>
          <SecondaryButton onClick={onLogout}>Sign out</SecondaryButton>
        </div>
      </header>
      <main className="main-content">
        <section className="content-header">
          <div>
            <h1>{activeItem?.label}</h1>
            <p>{activeItem?.description}</p>
          </div>
          <span className="badge badge-soft">Role: {user.role}</span>
        </section>
        <div className="content-area">{children}</div>
      </main>
    </div>
  );
}

function AssignmentsSection({
  assignments,
  selectedAssignment,
  onSelectAssignment,
  onSubmit,
  loading,
  user,
  onCreateAssignment,
  submissions,
  onSubmitReflection,
  onCancelPendingSubmission
}) {
  const [file, setFile] = useState(null);
  const [localMessage, setLocalMessage] = useState(null);
  const [pendingReflection, setPendingReflection] = useState(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [closingReflection, setClosingReflection] = useState(false);

  useEffect(() => {
    if (!selectedAssignment && assignments.length) {
      onSelectAssignment(assignments[0]);
    }
  }, [assignments, selectedAssignment, onSelectAssignment]);

  // Calculate submission count for selected assignment
  const submissionCount = selectedAssignment 
    ? submissions.filter(s => s.assignmentId === selectedAssignment.id).length
    : 0;
  const canSubmit = submissionCount < 2;
// Step 1: Student clicks Submit
  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!file || !selectedAssignment) {
      setLocalMessage({ type: 'error', text: 'Select an assignment and upload a ZIP file.' });
      return;
    }

    if (!canSubmit) {
      setLocalMessage({ type: 'error', text: 'Maximum submission limit reached. You can only submit 2 times per assignment.' });
      return;
    }

    const result = await onSubmit(selectedAssignment.id, file);
    if (result.success) {
      setFile(null);
      setLocalMessage({ type: 'success', text: 'Assignment submitted successfully.' });
      if (result.submissionId && result.assignmentId && onSubmitReflection) {
        setPendingReflection({ submissionId: result.submissionId, assignmentId: result.assignmentId });
      }
    } else {
      setLocalMessage({ type: 'error', text: result.error });
    }
  };

  const requestCloseReflection = () => {
    if (!pendingReflection) return;
    setShowCloseConfirm(true);
  };

  const keepReflectionOpen = () => {
    setShowCloseConfirm(false);
  };

  const confirmCloseReflection = async () => {
    if (!pendingReflection || !onCancelPendingSubmission) return;
    setClosingReflection(true);
    try {
      await onCancelPendingSubmission(pendingReflection.submissionId);
      setPendingReflection(null);
      setShowCloseConfirm(false);
      setLocalMessage(null);
      setFile(null);
    } catch (error) {
      setLocalMessage({
        type: 'error',
        text: error.response?.data?.error || 'Failed to close and remove submission.'
      });
    } finally {
      setClosingReflection(false);
    }
  };

  return (
    <div className={user?.role === 'teacher' ? '' : 'two-column'}>
      <div className="card assignments-list">
        <h2 style={{ margin: '0 0 1rem 0' }}>Assignments</h2>
        {user?.role === 'teacher' && onCreateAssignment && (
          <div style={{ marginBottom: '1.5rem' }}>
            <PrimaryButton onClick={onCreateAssignment}>
              + Create assignment
            </PrimaryButton>
          </div>
        )}
        <div className="assignment-items">
          {assignments.map((assignment) => (
            <button
              key={assignment.id}
              className={`assignment-item ${
                selectedAssignment?.id === assignment.id ? 'active' : ''
              }`}
              onClick={() => onSelectAssignment(assignment)}
            >
              <div>
                <h3>{assignment.title}</h3>
                <p>{assignment.description}</p>
              </div>
              <span className="badge badge-soft">View brief</span>
            </button>
          ))}
          {assignments.length === 0 && (
            <EmptyState
              title="No assignments published"
              description="Your courses will appear here once assigned by your instructor."
            />
          )}
        </div>
      </div>

      {user?.role !== 'teacher' && (
      <div className="card submission-panel">
        {selectedAssignment ? (
          <>
            <header>
              <h2>{selectedAssignment.title}</h2>
              <p>{selectedAssignment.description}</p>
            </header>
            {Array.isArray(selectedAssignment.details) && selectedAssignment.details.length > 0 && (
              <div className="assignment-brief">
                <h3>Assignment brief</h3>
                <ul>
                  {selectedAssignment.details.map((detail, index) => (
                    <li key={index}>{detail}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="submission-guidelines">
              <h3>Submission guidelines</h3>
              <ul>
                <li>Package your solution in a single ZIP file.</li>
                <li>Ensure your main entry point matches the assignment requirements.</li>
                <li>Include documentation or README if necessary.</li>
                  <li><strong>Important:</strong> You can submit a maximum of 2 times per assignment.</li>
              </ul>
                {submissionCount > 0 && (
                  <p style={{ marginTop: '0.75rem', color: submissionCount >= 2 ? '#dc2626' : '#64748b', fontWeight: submissionCount >= 2 ? 'bold' : 'normal' }}>
                    {submissionCount >= 2 
                      ? '⚠️ Maximum submission limit reached (2/2). You cannot submit again for this assignment.'
                      : `Submissions used: ${submissionCount}/2`
                    }
                  </p>
                )}
            </div>

            <form className="upload-form" onSubmit={handleSubmit}>
              <label className="file-input">
                <span>{file ? file.name : 'Upload ZIP archive'}</span>
                <input
                  type="file"
                  accept=".zip"
                  onChange={(event) => setFile(event.target.files[0])}
                />
              </label>
                <PrimaryButton type="submit" disabled={loading || !canSubmit}>
                  {loading ? 'Submitting…' : canSubmit ? 'Submit assignment' : 'Submission limit reached'}
              </PrimaryButton>
            </form>

            {localMessage && (
              <MessageBanner type={localMessage.type} onClose={() => setLocalMessage(null)}>
                {localMessage.text}
              </MessageBanner>
            )}
          </>
      ) : (
          <EmptyState
          title="Choose an assignment"
          description="Select an assignment from the list to review requirements and upload your solution."
          />
        )}
      </div>
      )}
      {/* Step 4: Open the required Reflection modal after a successful submission */}
      {pendingReflection && onSubmitReflection && (
        <div className="modal-backdrop" onClick={requestCloseReflection}>
          <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <h3>Reflection (required)</h3>
              <button type="button" onClick={requestCloseReflection} aria-label="Close modal">×</button>
            </header>
            <div className="modal-body">
              <ReflectionForm
                attemptNumber={submissions.filter((s) => s.assignmentId === pendingReflection.assignmentId).length}
                compact
                onSubmit={async (formData) => {
                  await onSubmitReflection({ submissionId: pendingReflection.submissionId, assignmentId: pendingReflection.assignmentId, ...formData });
                  setPendingReflection(null);
                  setShowCloseConfirm(false);
                }}
                onCancel={() => setPendingReflection(null)}
              />
            </div>
          </div>
        </div>
      )}
      {pendingReflection && showCloseConfirm && (
        <div className="modal-backdrop" onClick={keepReflectionOpen}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <h3>Close reflection form?</h3>
            </header>
            <div className="modal-body">
              <p>If you close this form, submission will not be completed and will not appear in student or teacher dashboards.</p>
              <div className="modal-actions">
                <SecondaryButton type="button" onClick={keepReflectionOpen} disabled={closingReflection}>
                  Cancel
                </SecondaryButton>
                <PrimaryButton type="button" onClick={confirmCloseReflection} disabled={closingReflection}>
                  {closingReflection ? 'Closing…' : 'Close'}
                </PrimaryButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SubmissionsSection({ submissions, assignments, onSubmitReflection }) {
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const lookupTitle = (assignmentId) =>
    assignments.find((assignment) => assignment.id === assignmentId)?.title || 'Assignment';

  useEffect(() => {
    if (!selectedSubmission) {
      setDetailData(null);
      return;
    }
    setLoadingDetail(true);
    axios.get(`/submissions/${selectedSubmission.id}`)
      .then((res) => setDetailData(res.data))
      .catch(() => setDetailData(null))
      .finally(() => setLoadingDetail(false));
  }, [selectedSubmission?.id]);

  const handleReflectionSubmit = async (data) => {
    if (!onSubmitReflection || !selectedSubmission) return;
    const reflection = await onSubmitReflection({
      submissionId: selectedSubmission.id,
      assignmentId: selectedSubmission.assignmentId,
      ...data
    });
    setDetailData((prev) => prev ? { ...prev, reflection } : null);
  };

  return (
    <div className="card">
      <h2>My submissions</h2>
      <p>Monitor grading progress and revisit previous uploads. Click a row to view details and complete the reflection.</p>

      {submissions.length === 0 ? (
        <EmptyState
          title="No submissions yet"
          description="Once you submit assignments, they will be tracked here with status and feedback."
        />
      ) : (
        <div className="submission-table">
          <div className="submission-table-header">
            <span>Assignment</span>
            <span>Submitted</span>
            <span>Status</span>
            <span>Score</span>
            <span>File</span>
          </div>
          {submissions.map((submission) => (
            <div
              key={submission.id}
              className="submission-table-row submission-table-row-clickable"
              onClick={() => setSelectedSubmission(submission)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setSelectedSubmission(submission)}
            >
              <span>{lookupTitle(submission.assignmentId)}</span>
              <span>{new Date(submission.createdAt).toLocaleString()}</span>
              <StatusPill submission={submission} />
              <span>
                {(submission.status === 'completed' || submission.status === 'failed') &&
                 (submission.score !== undefined && submission.score !== null) ? (
                  <strong>{Math.round((submission.score || 0) * 100)}%</strong>
                ) : (
                  <span style={{ color: '#999' }}>—</span>
                )}
              </span>
              <span>{submission.filename}</span>
            </div>
          ))}
        </div>
      )}

      {selectedSubmission && (
        <SubmissionDetailModal
          submission={selectedSubmission}
          assignmentTitle={lookupTitle(selectedSubmission.assignmentId)}
          detailData={detailData}
          loading={loadingDetail}
          submissions={submissions}
          onClose={() => setSelectedSubmission(null)}
          onSubmitReflection={handleReflectionSubmit}
        />
      )}
    </div>
  );
}

function SubmissionDetailModal({ submission, assignmentTitle, detailData, loading, onClose, onSubmitReflection, submissions = [] }) {
  const isGraded = submission.status === 'completed' || submission.status === 'failed';
  const reflection = detailData?.reflection;

  const attemptNumber = useMemo(() => {
    const list = submissions
      .filter((s) => s.assignmentId === submission.assignmentId)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt) || a.id - b.id);
    const idx = list.findIndex((s) => s.id === submission.id);
    return idx >= 0 ? idx + 1 : 1;
  }, [submissions, submission]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h3>Submission: {assignmentTitle}</h3>
          <button type="button" onClick={onClose} aria-label="Close modal">×</button>
        </header>
        <div className="modal-body modal-body-grid">
          {loading ? (
            <p>Loading…</p>
          ) : (
            <>
              <section className="modal-column">
                <div className="submission-detail-info">
                  <p><strong>File:</strong> {submission.filename}</p>
                  <p><strong>Submitted:</strong> {new Date(submission.createdAt).toLocaleString()}</p>
                  <p><strong>Status:</strong> <StatusPill submission={submission} /></p>
                  {(submission.score !== undefined && submission.score !== null) && (
                    <p><strong>Score:</strong> {Math.round((submission.score || 0) * 100)}%</p>
                  )}
                </div>
                {detailData?.result?.feedback && (
                  <div className="submission-feedback">
                    <h4>Test feedback</h4>
                    <pre className="feedback-pre">{detailData.result.feedback}</pre>
                  </div>
                )}
              </section>
              <section className="modal-column">
                {isGraded && (
                  reflection ? (
                    <ReflectionSummary reflection={reflection} showTeacherFeedback compact />
                  ) : (
                    <ReflectionForm
                      attemptNumber={attemptNumber}
                      onSubmit={onSubmitReflection}
                      onCancel={onClose}
                    />
                  )
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const REFLECTION_REQUIRED_FIELDS_ATTEMPT1 = [
  { key: 'learnedText', label: 'What did you learn from this exercise?' },
  { key: 'difficultiesText', label: 'What difficulties did you encounter?' },
  { key: 'wroteCodeMyself', label: 'You wrote the code primarily yourself.' },
  { key: 'aiToolUsage', label: 'You used AI tools while working on this task.' },
  { key: 'reflectedOnApproach', label: 'You thought about your problem-solving strategy while working on this task.' }
];

const REFLECTION_REQUIRED_FIELDS_ATTEMPT2 = [
  { key: 'revisionChangeText', label: 'Changes after feedback and why they should improve your solution' },
  { key: 'revisionUnderstandText', label: 'What you understand better now—and what is still unclear' },
  { key: 'revisionNextIterationText', label: 'What you would still change with one more iteration' }
];

function ReflectionForm({ onSubmit, onCancel, attemptNumber = 1, compact = false }) {
  const isSecondAttempt = attemptNumber >= 2;

  const [learnedText, setLearnedText] = useState('');
  const [difficultiesText, setDifficultiesText] = useState('');
  const [wroteCodeMyself, setWroteCodeMyself] = useState('');
  const [aiToolUsage, setAiToolUsage] = useState('');
  const [understoodGeneratedCode, setUnderstoodGeneratedCode] = useState('');
  const [ownVsExternalPercent, setOwnVsExternalPercent] = useState(50);
  const [reflectedOnApproach, setReflectedOnApproach] = useState('');

  const [revisionChangeText, setRevisionChangeText] = useState('');
  const [revisionUnderstandText, setRevisionUnderstandText] = useState('');
  const [revisionNextIterationText, setRevisionNextIterationText] = useState('');

  const [submitting, setSubmitting] = useState(false);

  const getValuesAttempt1 = () => ({ learnedText, difficultiesText, wroteCodeMyself, aiToolUsage, reflectedOnApproach });
// Step 4.1: check if all required field are filled.
  const validateAttempt1 = () => {
    const vals = getValuesAttempt1();
    return REFLECTION_REQUIRED_FIELDS_ATTEMPT1.filter((f) => !vals[f.key] || String(vals[f.key]).trim() === '');
  };

  const validateAttempt2 = () => {
    const vals = { revisionChangeText, revisionUnderstandText, revisionNextIterationText };
    return REFLECTION_REQUIRED_FIELDS_ATTEMPT2.filter((f) => !vals[f.key] || String(vals[f.key]).trim() === '');
  };

  const validate = () => (isSecondAttempt ? validateAttempt2() : validateAttempt1());
  const hasMissingRequired = validate().length > 0;
  // Step 4.2: Validate required reflection answers before submitting.
  const handleSubmit = async (e) => {
    e.preventDefault();
    const missing = validate();
    if (missing.length > 0) {
      alert(`Please answer all required questions:\n\n• ${missing.map((m) => m.label).join('\n• ')}`);
      return;
    }
    setSubmitting(true);
    try {
      if (isSecondAttempt) {
        await onSubmit({
          revisionChangeText,
          revisionUnderstandText,
          revisionNextIterationText
        });
      } else {
        await onSubmit({
          learnedText,
          difficultiesText,
          wroteCodeMyself: wroteCodeMyself ? parseInt(wroteCodeMyself, 10) : null,
          aiToolUsage: aiToolUsage || null,
          understoodGeneratedCode: understoodGeneratedCode ? parseInt(understoodGeneratedCode, 10) : null,
          ownVsExternalPercent,
          reflectedOnApproach: reflectedOnApproach ? parseInt(reflectedOnApproach, 10) : null
        });
      }
      onCancel();
    } catch (err) {
      console.error('Reflection submit failed:', err);
    } finally {
      setSubmitting(false);
    }
  };

  if (isSecondAttempt) {
    return (
      <div className="reflection-form">
        <h4>Reflection — second submission</h4>
        <p className="reflection-intro">
          This is your <strong>second attempt</strong> for this assignment. Answer all questions. They focus on what you changed after feedback and how your understanding evolved.
        </p>
        <form onSubmit={handleSubmit}>
          <label>
            What did you change after feedback and reflection, and why should that improve your solution?
            <textarea
              rows={4}
              value={revisionChangeText}
              onChange={(e) => setRevisionChangeText(e.target.value)}
              placeholder="Describe concrete changes (logic, tests, structure, error handling) and why they should help."
            />
          </label>
          <label>
            Compared to your first submission, what do you understand better now about your own code or the problem—and what is still unclear?
            <textarea
              rows={4}
              value={revisionUnderstandText}
              onChange={(e) => setRevisionUnderstandText(e.target.value)}
              placeholder="Be specific about understanding vs remaining gaps."
            />
          </label>
          <label>
            If you had one more iteration, what would you still change and why?
            <textarea
              rows={4}
              value={revisionNextIterationText}
              onChange={(e) => setRevisionNextIterationText(e.target.value)}
              placeholder="Optional improvements you did not have time to make."
            />
          </label>
          <div className="modal-actions">
            <PrimaryButton type="submit" disabled={submitting || hasMissingRequired}>{submitting ? 'Saving…' : 'Submit reflection'}</PrimaryButton>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className={`reflection-form ${compact ? 'reflection-form-compact' : ''}`}>
      <h4>Reflection (ACA-Reflection-Extension)</h4>
      {!compact && (
        <p className="reflection-intro">Please reflect on your learning process for this task. All questions are required. Your responses support research on self-directed learning.</p>
      )}
      <form onSubmit={handleSubmit}>
        <label className="full-width">
          What did you learn from this exercise?
          <textarea rows={compact ? 2 : 3} value={learnedText} onChange={(e) => setLearnedText(e.target.value)} placeholder="Describe what you learned..." />
        </label>
        <label className="full-width">
          What difficulties did you encounter while solving the task?
          <textarea rows={compact ? 2 : 3} value={difficultiesText} onChange={(e) => setDifficultiesText(e.target.value)} placeholder="Describe any challenges..." />
        </label>
        <div className="reflection-grid">
          <label>
            I wrote the code mostly myself (1-5)
            <select value={wroteCodeMyself} onChange={(e) => setWroteCodeMyself(e.target.value)}>
              <option value="">— Select —</option>
              <option value="1">1 - Strongly disagree</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5 - Strongly agree</option>
            </select>
          </label>
          <label>
            AI tool usage during this task
            <select value={aiToolUsage} onChange={(e) => setAiToolUsage(e.target.value)}>
              <option value="">— Select —</option>
              <option value="Never">Never</option>
              <option value="Sometimes">Sometimes</option>
              <option value="Often">Often</option>
              <option value="Always">Always</option>
            </select>
          </label>
          <label>
            I understood AI-generated code before submit (1-5)
            <select value={understoodGeneratedCode} onChange={(e) => setUnderstoodGeneratedCode(e.target.value)}>
              <option value="">— Select —</option>
              <option value="1">1 - Strongly disagree</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5 - Strongly agree</option>
            </select>
          </label>
          <label>
            I reflected on my problem-solving strategy (1-5)
            <select value={reflectedOnApproach} onChange={(e) => setReflectedOnApproach(e.target.value)}>
              <option value="">— Select —</option>
              <option value="1">1 - Strongly disagree</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5 - Strongly agree</option>
            </select>
          </label>
          <label className="full-width">
            Own work vs external help: {ownVsExternalPercent}% own work
            <input
              type="range"
              min="0"
              max="100"
              value={ownVsExternalPercent}
              onChange={(e) => setOwnVsExternalPercent(parseInt(e.target.value, 10))}
            />
          </label>
        </div>
        <div className="modal-actions">
          <PrimaryButton type="submit" disabled={submitting || hasMissingRequired}>{submitting ? 'Saving…' : 'Submit reflection'}</PrimaryButton>
        </div>
      </form>
    </div>
  );
}

function ReflectionSummary({ reflection, showTeacherFeedback = false, compact = false }) {
  const likertLabels = { 1: 'Strongly disagree', 2: 'Disagree', 3: 'Neutral', 4: 'Agree', 5: 'Strongly agree' };
  const likertScale = [
    { value: 1, label: 'Strongly disagree', color: '#ef4444' },
    { value: 2, label: 'Disagree', color: '#f97316' },
    { value: 3, label: 'Neutral', color: '#eab308' },
    { value: 4, label: 'Agree', color: '#84cc16' },
    { value: 5, label: 'Strongly agree', color: '#22c55e' }
  ];
  const formatLikert = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return String(value);
    const label = likertLabels[numeric];
    return label ? `${numeric} - ${label}` : String(value);
  };
  const renderLikertScale = (title, value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    if (compact) {
      return <p><strong>{title}:</strong> {formatLikert(numeric)}</p>;
    }
    return (
      <div className="likert-scale-card">
        <p className="likert-scale-title"><strong>{title}:</strong> {formatLikert(numeric)}</p>
        <div className="likert-scale-row">
          {likertScale.map((step) => (
            <div
              key={step.value}
              className={`likert-scale-step ${numeric === step.value ? 'active' : ''}`}
              style={{ '--scale-color': step.color }}
              title={`${step.value} - ${step.label}`}
            >
              <span className="likert-scale-number">{step.value}</span>
              <span className="likert-scale-label">{step.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };
  const logicalCheckLabel = {
    logical: 'Logical and coherent',
    not_logical: 'Not logical/coherent'
  };
  const isSecond = reflection.reflectionAttempt === 2 ||
    (reflection.revisionChangeText && String(reflection.revisionChangeText).trim() !== '');
  const hasTeacherFeedback = showTeacherFeedback && (
    reflection.logicalCheck === 'logical' ||
    reflection.logicalCheck === 'not_logical' ||
    (reflection.teacherNotes && String(reflection.teacherNotes).trim() !== '')
  );
  const renderTeacherFeedback = () => {
    if (!hasTeacherFeedback) return null;
    return (
      <div className="teacher-feedback-summary">
        <h5>Teacher feedback</h5>
        {(reflection.logicalCheck === 'logical' || reflection.logicalCheck === 'not_logical') && (
          <p><strong>Coherence:</strong> {logicalCheckLabel[reflection.logicalCheck]}</p>
        )}
        {reflection.teacherNotes && String(reflection.teacherNotes).trim() !== '' && (
          <p><strong>Notes:</strong> {reflection.teacherNotes}</p>
        )}
      </div>
    );
  };

  if (isSecond) {
    return (
      <div className="reflection-summary">
        <h4>Student reflection (second submission)</h4>
        <p><strong>Changes after feedback and expected improvement:</strong> {reflection.revisionChangeText || '—'}</p>
        <p><strong>Understanding now vs still unclear:</strong> {reflection.revisionUnderstandText || '—'}</p>
        <p><strong>Further changes with another iteration:</strong> {reflection.revisionNextIterationText || '—'}</p>
        {renderTeacherFeedback()}
      </div>
    );
  }

  return (
    <div className="reflection-summary">
      <h4>Student reflection</h4>
      {reflection.learnedText && <p><strong>What you learned:</strong> {reflection.learnedText}</p>}
      {reflection.difficultiesText && <p><strong>Difficulties:</strong> {reflection.difficultiesText}</p>}
      {reflection.wroteCodeMyself != null && renderLikertScale('Wrote code myself', reflection.wroteCodeMyself)}
      {reflection.aiToolUsage && <p><strong>AI tool usage:</strong> {reflection.aiToolUsage}</p>}
      {reflection.understoodGeneratedCode != null && renderLikertScale('Understood generated code', reflection.understoodGeneratedCode)}
      {reflection.ownVsExternalPercent != null && <p><strong>Own vs external:</strong> {reflection.ownVsExternalPercent}% own work</p>}
      {reflection.reflectedOnApproach != null && renderLikertScale('Thought about strategy', reflection.reflectedOnApproach)}
      {renderTeacherFeedback()}
    </div>
  );
}

function TeacherSection({ assignments, submissions, reflections = [], onRefreshReflections }) {
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const lookupTitle = (assignmentId) =>
    assignments.find((assignment) => assignment.id === assignmentId)?.title || 'Assignment';

  useEffect(() => {
    if (!selectedSubmission) {
      setDetailData(null);
      return;
    }
    setLoadingDetail(true);
    axios.get(`/submissions/${selectedSubmission.id}`)
      .then((res) => setDetailData(res.data))
      .catch(() => setDetailData(null))
      .finally(() => setLoadingDetail(false));
  }, [selectedSubmission?.id]);
  
  // Calculate unique students
  const uniqueStudents = new Set(submissions.map(s => s.userEmail || s.userId)).size;
  const totalAssignments = assignments.length;
  const totalSubmissions = submissions.length;

  return (
    <div className="space-y">
      <section className="stat-grid teacher-header">
        <div className="stat-card">
          <h3>Active students</h3>
          <p className="stat-value">{uniqueStudents}</p>
          <span>Students with submissions</span>
        </div>
        <div className="stat-card">
          <h3>Published assignments</h3>
          <p className="stat-value">{totalAssignments}</p>
          <span>Actively assigned this term</span>
        </div>
        <div className="stat-card">
          <h3>Total submissions</h3>
          <p className="stat-value">{totalSubmissions}</p>
          <span>Pending and graded</span>
        </div>
        <div className="stat-card">
          <h3>Reflections</h3>
          <p className="stat-value">{reflections.length}</p>
          <span>Student reflection responses (ACA-Reflection-Extension)</span>
        </div>
      </section>

      <section className="card">
        <h2>All submissions</h2>
        <p>View and monitor all student submissions across all assignments.</p>

        {submissions.length === 0 ? (
          <EmptyState
            title="No submissions yet"
            description="Student submissions will appear here once they submit their assignments."
          />
        ) : (
          <div className="submission-table">
            <div className="submission-table-header">
              <span>Student</span>
              <span>Assignment</span>
              <span>Submitted</span>
              <span>Status</span>
              <span>Score</span>
              <span>File</span>
            </div>
            {submissions.map((submission) => (
              <div
                key={submission.id}
                className="submission-table-row submission-table-row-clickable"
                onClick={() => setSelectedSubmission(submission)}
              >
                <span>{submission.userEmail || `User #${submission.userId}`}</span>
                <span>{lookupTitle(submission.assignmentId)}</span>
                <span>{new Date(submission.createdAt).toLocaleString()}</span>
                <StatusPill submission={submission} />
                <span>
                  {(submission.status === 'completed' || submission.status === 'failed') && 
                   (submission.score !== undefined && submission.score !== null) ? (
                    <strong>{Math.round((submission.score || 0) * 100)}%</strong>
                  ) : (
                    <span style={{ color: '#999' }}>—</span>
                  )}
                </span>
                <span>{submission.filename}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {selectedSubmission && (
        <TeacherSubmissionModal
          submission={selectedSubmission}
          assignmentTitle={lookupTitle(selectedSubmission.assignmentId)}
          detailData={detailData}
          loading={loadingDetail}
          onClose={() => setSelectedSubmission(null)}
          onRefreshReflections={onRefreshReflections}
        />
      )}
    </div>
  );
}

function TeacherSubmissionModal({ submission, assignmentTitle, detailData, loading, onClose, onRefreshReflections }) {
  const [logicalCheck, setLogicalCheck] = useState(detailData?.reflection?.logicalCheck ?? '');
  const [teacherNotes, setTeacherNotes] = useState(detailData?.reflection?.teacherNotes ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLogicalCheck(detailData?.reflection?.logicalCheck ?? '');
    setTeacherNotes(detailData?.reflection?.teacherNotes ?? '');
  }, [detailData?.reflection?.id]);

  const handleSaveAssessment = async () => {
    if (!detailData?.reflection) return;
    setSaving(true);
    try {
      await axios.patch(`/reflections/${detailData.reflection.id}`, { logicalCheck: logicalCheck || null, teacherNotes });
      onRefreshReflections?.();
      onClose();
    } catch (err) {
      console.error('Failed to save assessment:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h3>Submission: {assignmentTitle}</h3>
          <button type="button" onClick={onClose} aria-label="Close modal">×</button>
        </header>
        <div className="modal-body modal-body-grid">
          {loading ? (
            <p>Loading…</p>
          ) : (
            <>
              <section className="modal-column">
                <div className="submission-detail-info">
                  <p><strong>Student:</strong> {submission.userEmail || `User #${submission.userId}`}</p>
                  <p><strong>File:</strong> {submission.filename}</p>
                  <p><strong>Submitted:</strong> {new Date(submission.createdAt).toLocaleString()}</p>
                  <p><strong>Status:</strong> <StatusPill submission={submission} /></p>
                  {(submission.score !== undefined && submission.score !== null) && (
                    <p><strong>Score:</strong> {Math.round((submission.score || 0) * 100)}%</p>
                  )}
                </div>
                {detailData?.result?.feedback && (
                  <div className="submission-feedback">
                    <h4>Test feedback</h4>
                    <pre className="feedback-pre">{detailData.result.feedback}</pre>
                  </div>
                )}
              </section>
              <section className="modal-column">
                {detailData?.reflection ? (
                  <>
                    <ReflectionSummary reflection={detailData.reflection} compact />
                    <div className="reflection-assessment">
                      <h4>Teacher assessment</h4>
                      <label>
                        Is the reflection logical and coherent?
                        <select value={logicalCheck} onChange={(e) => setLogicalCheck(e.target.value)}>
                          <option value="">— Not checked —</option>
                          <option value="logical">Logical</option>
                          <option value="not_logical">Not logical</option>
                        </select>
                      </label>
                      <label>
                        Notes (optional)
                        <textarea rows={2} value={teacherNotes} onChange={(e) => setTeacherNotes(e.target.value)} placeholder="Teacher notes..." />
                      </label>
                      <PrimaryButton onClick={handleSaveAssessment} disabled={saving}>
                        {saving ? 'Saving…' : 'Save assessment'}
                      </PrimaryButton>
                    </div>
                  </>
                ) : (
                  <p className="reflection-missing">No reflection submitted for this submission yet.</p>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <header className="modal-header">
          <h3>{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close modal">
            ×
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

function CreateAssignmentModal({ form, onChangeField, onSelectFile, testFile, onSubmit, onClose, saving }) {
  return (
    <Modal title="Create assignment" onClose={onClose}>
      <form className="modal-form" onSubmit={onSubmit}>
        <label>
          Slug
          <input
            type="text"
            value={form.slug}
            onChange={(event) => onChangeField('slug', event.target.value)}
            placeholder="e.g. even-number-check"
            required
          />
        </label>

        <label>
          Title
          <input
            type="text"
            value={form.title}
            onChange={(event) => onChangeField('title', event.target.value)}
            required
          />
        </label>

        <label>
          Description
          <input
            type="text"
            value={form.description}
            onChange={(event) => onChangeField('description', event.target.value)}
            placeholder="Short summary shown to students"
          />
        </label>

        <label>
          Details
          <textarea
            rows={4}
            value={form.details}
            onChange={(event) => onChangeField('details', event.target.value)}
            placeholder="One requirement per line"
          />
        </label>

        <label>
          Test file (.py)
          <input
            type="file"
            accept=".py"
            onChange={(event) => onSelectFile(event.target.files?.[0] || null)}
            required
          />
          {testFile && <span className="file-hint">{testFile.name}</span>}
        </label>
        <small style={{ color: '#475569' }}>
          Upload the pytest file used to grade submissions. Students cannot see this file.
        </small>

        <div className="modal-actions">
          <SecondaryButton type="button" onClick={onClose}>
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit" disabled={saving}>
            {saving ? 'Creating…' : 'Create assignment'}
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}

function StatusPill({ submission }) {
  const { label, className } = getSubmissionStatusInfo(submission);
  return <span className={`status-pill ${className}`}>{label}</span>;
}

function MessageBanner({ type = 'info', children, onClose }) {
  return (
    <div className={`message-banner message-${type}`}>
      <span>{children}</span>
      <button onClick={onClose} aria-label="Close notification">
        ×
      </button>
    </div>
  );
}

function PrimaryButton({ children, ...props }) {
  return (
    <button className="btn primary" {...props}>
      {children}
    </button>
  );
}

function SecondaryButton({ children, ...props }) {
  return (
    <button className="btn secondary" {...props}>
      {children}
    </button>
  );
}

function EmptyState({ title, description }) {
  return (
    <div className="empty-state">
      <div className="empty-illustration" />
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

export default App;







