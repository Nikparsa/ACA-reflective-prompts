const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { detectLanguage, getLanguageConfig, getSupportedLanguages } = require('./lib/language-detector.js');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key';
const RUNNER_URL = process.env.RUNNER_URL || 'http://localhost:5001';

// Middleware
app.use(cors());
app.use(express.json());
// Frontend path - __dirname is backend/src, so go up two levels to project root
const projectRoot = path.resolve(__dirname, '../..');
const frontendDistPath = path.join(projectRoot, 'frontend', 'dist');
console.log('Serving frontend from:', frontendDistPath);
console.log('Frontend dist exists:', fs.existsSync(frontendDistPath));
console.log('Frontend index.html exists:', fs.existsSync(path.join(frontendDistPath, 'index.html')));
app.use(express.static(frontendDistPath));

// Create data directories
const dataDir = path.join(__dirname, 'data');
const submissionsDir = path.join(dataDir, 'submissions');
const resultsDir = path.join(dataDir, 'results');
const customTasksDir = path.join(dataDir, 'tests');
const dbPath = path.join(dataDir, 'database.json');

for (const dir of [dataDir, submissionsDir, resultsDir, customTasksDir]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Load database from file or create default
let database;
if (fs.existsSync(dbPath)) {
  try {
    database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    console.log(`Database loaded from file: ${dbPath}`);
    console.log(`  - Users: ${database.users?.length || 0}`);
    console.log(`  - Assignments: ${database.assignments?.length || 0}`);
    console.log(`  - Submissions: ${database.submissions?.length || 0}`);
    console.log(`  - Results: ${database.results?.length || 0}`);
  } catch (error) {
    console.error('Error loading database:', error);
    database = createDefaultDatabase();
  }
} else {
  database = createDefaultDatabase();
  saveDatabase();
  console.log('Created new database with default data');
  console.log(`  - Users: ${database.users?.length || 0}`);
  console.log(`  - Assignments: ${database.assignments?.length || 0}`);
  console.log(`  - Submissions: ${database.submissions?.length || 0}`);
  console.log(`  - Results: ${database.results?.length || 0}`);
}

function ensureAssignmentMetadata() {
  let mutated = false;
  database.assignments = (database.assignments || []).map((assignment) => {
    if (!assignment.origin) {
      mutated = true;
      return { ...assignment, origin: 'builtin' };
    }
    return assignment;
  });
  if (mutated) {
    saveDatabase();
  }
}

ensureAssignmentMetadata();

function ensureReflections() {
  if (!database.reflections) {
    database.reflections = [];
    saveDatabase();
    console.log('Initialized reflections array in database');
  }
}
ensureReflections();

/** 1-based attempt index for this user on this assignment (ordered by time, then id). */
function getSubmissionAttemptNumber(submission) {
  const siblings = database.submissions.filter(
    (s) => s.userId === submission.userId && s.assignmentId === submission.assignmentId
  );
  siblings.sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    if (ta !== tb) return ta - tb;
    return a.id - b.id;
  });
  const idx = siblings.findIndex((s) => s.id === submission.id);
  return idx >= 0 ? idx + 1 : 1;
}

function createDefaultDatabase() {
  return {
    users: [
      { id: 1, email: 'student@test.com', password: '123456', role: 'student' },
      { id: 2, email: 'teacher@test.com', password: '123456', role: 'teacher' }
    ],
    assignments: [
      { id: 1, title: 'FizzBuzz', slug: 'fizzbuzz', description: 'Write a FizzBuzz function', origin: 'builtin' },
      { id: 2, title: 'CSV Statistics', slug: 'csv-stats', description: 'Process CSV data', origin: 'builtin' },
      { id: 3, title: 'Vector2D', slug: 'vector2d', description: '2D Vector operations', origin: 'builtin' }
    ],
    submissions: [],
    results: [],
    reflections: []
  };
}

function saveDatabase() {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(database, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving database:', error);
  }
}

// Auth middleware
function authRequired(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    console.log(`[AUTH] No token provided for ${req.method} ${req.path}`);
    return res.status(401).json({ error: 'No token' });
  }
  
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    console.log(`[AUTH] User authenticated: ${req.user.email} (${req.user.role}) for ${req.method} ${req.path}`);
    next();
  } catch (error) {
    console.log(`[AUTH] Invalid token for ${req.method} ${req.path}: ${error.message}`);
    res.status(401).json({ error: 'Invalid token' });
  }
}

function teacherOnly(req, res, next) {
  if (req.user?.role !== 'teacher') {
    return res.status(403).json({ error: 'Teacher permissions required' });
  }
  next();
}

function normalizeDetails(details) {
  if (!details) return [];
  if (Array.isArray(details)) {
    return details
      .map((detail) => (typeof detail === 'string' ? detail.trim() : ''))
      .filter(Boolean);
  }
  if (typeof details === 'string') {
    return details
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  }
  return [];
}

function toTitleCase(slug = '') {
  return slug
    .replace(/[-_]/g, ' ')
    .replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase())
    .trim();
}

function sanitizeSlug(value = '') {
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/--+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Multer for file uploads
// (Uploaded files are automatically renamed with a timestamp prefix 
// to ensure unique filenames and prevent conflicts.)
const storage = multer.diskStorage({
  destination: submissionsDir,
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });
const teacherTestsUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }
});

// Routes
app.get('/api', (req, res) => {
  res.json({ 
    service: 'ACA Backend API', 
    status: 'running',
    version: '1.0.0'
  });
});

// Get supported languages
app.get('/api/languages', (req, res) => {
  res.json({
    supported_languages: getSupportedLanguages(),
    language_configs: getSupportedLanguages().reduce((configs, lang) => {
      configs[lang] = getLanguageConfig(lang);
      return configs;
    }, {})
  });
});

// Auth routes
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = database.users.find(u => u.email === email && u.password === password);
  
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role }, 
    JWT_SECRET, 
    { expiresIn: '24h' }
  );
  
  res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
});

app.post('/api/auth/register', (req, res) => {
  const { email, password, role = 'student' } = req.body;
  
  if (database.users.find(u => u.email === email)) {
    return res.status(400).json({ error: 'User already exists' });
  }
  
  const user = {
    id: database.users.length + 1,
    email,
    password,
    role
  };
  
  database.users.push(user);
  saveDatabase();
  
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role }, 
    JWT_SECRET, 
    { expiresIn: '24h' }
  );
  
  res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
});

// Assignment routes
app.get('/api/assignments', authRequired, (req, res) => {
  console.log(`[ASSIGNMENTS] User ${req.user.email} (${req.user.role}) requesting assignments`);
  console.log(`[ASSIGNMENTS] Returning ${database.assignments?.length || 0} assignments`);
  res.json(database.assignments || []);
});

// Public route for runner (no auth required)
app.get('/api/runner/assignments', (req, res) => {
  res.json(database.assignments);
});

app.post('/api/assignments', authRequired, teacherOnly, teacherTestsUpload.single('testFile'), (req, res) => {
  const { title, slug, description = '', details } = req.body || {};

  if (!title || !slug) {
    return res.status(400).json({ error: 'Title and slug are required' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'Test file is required' });
  }

  const normalizedSlug = sanitizeSlug(slug);
  if (!normalizedSlug) {
    return res.status(400).json({ error: 'Invalid slug. Use alphanumeric characters and hyphens only.' });
  }

  if (database.assignments.some((assignment) => assignment.slug === normalizedSlug)) {
    return res.status(400).json({ error: 'An assignment with this slug already exists.' });
  }

  const assignmentDir = path.join(customTasksDir, normalizedSlug);
  const assignmentTestsDir = path.join(assignmentDir, 'tests');
  fs.mkdirSync(assignmentTestsDir, { recursive: true });

  const originalName = (req.file.originalname || 'tests.py').replace(/[^\w.\-]/g, '_');
  const filename = originalName.endsWith('.py') ? originalName : `${originalName}.py`;
  const destination = path.join(assignmentTestsDir, filename);
  fs.writeFileSync(destination, req.file.buffer);

  const nextId = database.assignments.reduce((max, assignment) => Math.max(max, assignment.id), 0) + 1;
  const newAssignment = {
    id: nextId,
    title: title.trim(),
    slug: normalizedSlug,
    description: description.trim(),
    details: normalizeDetails(details),
    origin: 'custom',
    createdBy: req.user.id,
    createdAt: new Date().toISOString()
  };

  database.assignments.push(newAssignment);
  saveDatabase();

  res.status(201).json(newAssignment);
});

app.put('/api/assignments/:id', authRequired, teacherOnly, (req, res) => {
  const assignmentId = parseInt(req.params.id);
  const assignment = database.assignments.find((item) => item.id === assignmentId);

  if (!assignment) {
    return res.status(404).json({ error: 'Assignment not found' });
  }

  const { title, description, details } = req.body || {};

  if (title) assignment.title = title.trim();
  if (description !== undefined) assignment.description = description.trim();
  if (details !== undefined) assignment.details = normalizeDetails(details);

  saveDatabase();
  res.json(assignment);
});

app.delete('/api/assignments/:id', authRequired, teacherOnly, (req, res) => {
  const assignmentId = parseInt(req.params.id);
  const assignmentIndex = database.assignments.findIndex((assignment) => assignment.id === assignmentId);

  if (assignmentIndex === -1) {
    return res.status(404).json({ error: 'Assignment not found' });
  }

  const [removedAssignment] = database.assignments.splice(assignmentIndex, 1);

  if (removedAssignment?.origin === 'custom') {
    const customDir = path.join(customTasksDir, removedAssignment.slug);
    if (fs.existsSync(customDir)) {
      fs.rmSync(customDir, { recursive: true, force: true });
    }
  }

  saveDatabase();
  res.json({ ok: true });
});

// Step 3: Backend receives it, validates, creates submissionId
app.post('/api/submissions', authRequired, upload.single('file'), (req, res) => {
  const { assignmentId } = req.body;
  
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const parsedAssignmentId = parseInt(assignmentId, 10);
  if (!Number.isFinite(parsedAssignmentId)) {
    return res.status(400).json({ error: 'Invalid assignmentId.' });
  }
  const assignmentExists = (database.assignments || []).some((a) => a.id === parsedAssignmentId);
  if (!assignmentExists) {
    return res.status(400).json({ error: 'Unknown assignment. Refresh the page and select an assignment from the list.' });
  }

  // Check submission limit: maximum 2 submissions per assignment per student
  const userSubmissions = database.submissions.filter(
    s => s.userId === req.user.id && s.assignmentId === parsedAssignmentId
  );
  
  if (userSubmissions.length >= 2) {
    return res.status(400).json({ 
      error: 'Maximum submission limit reached. You can only submit 2 times per assignment.' 
    });
  }

 // Creates a new submission record with auto-incremented ID.
// The submission ID is generated by adding 1 to the current number of submissions
// in the database, ensuring sequential numbering (e.g., #1, #2, #3...).
// The submission is immediately added to the database and saved to disk.
// Status is set to 'queued' until the runner processes it.
  // Step 3.1: Creates a new submission record with auto-incremented ID.
  const submission = {
    id: database.submissions.length + 1,
    userId: req.user.id,
    assignmentId: parsedAssignmentId,
    filename: req.file.filename,
    status: 'queued',
    createdAt: new Date().toISOString()
  };
  
  database.submissions.push(submission);
  saveDatabase();
  
  // Send to runner
  console.log(`[SUBMISSION] Sending submission ${submission.id} to runner at ${RUNNER_URL}/run`);
  console.log(`[SUBMISSION] Submission data:`, JSON.stringify({
    submissionId: submission.id,
    assignmentId: submission.assignmentId,
    filename: req.file.filename
  }));
  
  // Update status to processing immediately
  submission.status = 'processing';
  saveDatabase();
  console.log(`[SUBMISSION] Updated submission ${submission.id} status to 'processing'`);
  
  fetch(`${RUNNER_URL}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      submissionId: submission.id,
      assignmentId: submission.assignmentId,
      filename: req.file.filename
    })
  })
  .then(response => {
    console.log(`[SUBMISSION] Runner response status: ${response.status} for submission ${submission.id}`);
    if (!response.ok) {
      console.error(`[SUBMISSION] ERROR: Runner responded with status ${response.status}`);
      console.error(`[SUBMISSION] Response text:`, response.statusText);
      // Update status to failed if runner rejects
      submission.status = 'failed';
      saveDatabase();
    } else {
      console.log(`[SUBMISSION] Submission ${submission.id} successfully sent to runner`);
    }
    return response.json();
  })
  .then(data => {
    console.log(`[SUBMISSION] Runner response data for submission ${submission.id}:`, JSON.stringify(data));
  })
  .catch(err => {
    console.error(`[SUBMISSION] CRITICAL ERROR: Failed to send submission ${submission.id} to runner`);
    console.error(`[SUBMISSION] Error type: ${err.name}, message: ${err.message}`);
    console.error(`[SUBMISSION] Runner URL: ${RUNNER_URL}/run`);
    console.error(`[SUBMISSION] Full error:`, err);
    // Update status to failed
    const failedSubmission = database.submissions.find(s => s.id === submission.id);
    if (failedSubmission) {
      failedSubmission.status = 'failed';
      saveDatabase();
    }
  });
  // Step 3.2: Returns submissionId to frontend
  res.json({ 
    submissionId: submission.id,
    message: 'Submission queued for processing'
  });
});

// Get all submissions for current user (or all submissions for teachers)
app.get('/api/submissions', authRequired, (req, res) => {
  // Teachers can see all submissions, students only their own
  const submissionsToReturn = req.user.role === 'teacher'
    ? database.submissions
    : database.submissions.filter(s => s.userId === req.user.id);
  
    // add each user email to database.users  
  const enrichedSubmissions = submissionsToReturn
    .map(submission => {
      const result = database.results.find(r => r.submissionId === submission.id);
      const user = database.users.find(u => u.id === submission.userId);
      
      // Only show score if submission is completed or failed (not processing/queued)
      // If status is processing/queued, score should be undefined (not 0)
      let scoreValue = undefined;
      if (submission.status === 'completed' || submission.status === 'failed') {
        // Use result.score if available, otherwise fall back to submission.score
        // Score 0 is valid and should be displayed for completed/failed submissions
        scoreValue = result?.score !== undefined && result?.score !== null 
          ? result.score 
          : (submission.score !== undefined && submission.score !== null ? submission.score : 0);
      }
      // If status is processing/queued, scoreValue stays undefined (will not show 0%)
      
      return {
        ...submission,
        score: scoreValue, // undefined for processing, number for completed/failed
        totalTests: result?.totalTests,
        passedTests: result?.passedTests,
        feedback: result?.feedback,
        // Include user email for teachers
        userEmail: user?.email || 'Unknown'
      };
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // Newest first
  
  res.json(enrichedSubmissions);
});

app.get('/api/submissions/:id', authRequired, (req, res) => {
  const submissionId = parseInt(req.params.id);
  const submission = database.submissions.find(s => s.id === submissionId);
  
  if (!submission) {
    return res.status(404).json({ error: 'Submission not found' });
  }
  
  const result = database.results.find(r => r.submissionId === submissionId);
  const reflection = database.reflections?.find(r => r.submissionId === submissionId);
  
  res.json({ submission, result, reflection });
});

app.delete('/api/submissions/:id/cancel', authRequired, (req, res) => {
  const submissionId = parseInt(req.params.id, 10);
  if (!Number.isFinite(submissionId)) {
    return res.status(400).json({ error: 'Invalid submission id' });
  }

  const submissionIndex = database.submissions.findIndex((s) => s.id === submissionId);
  if (submissionIndex === -1) {
    return res.status(404).json({ error: 'Submission not found' });
  }

  const submission = database.submissions[submissionIndex];
  const isOwner = submission.userId === req.user.id;
  if (req.user.role !== 'teacher' && !isOwner) {
    return res.status(403).json({ error: 'You can only cancel your own submissions' });
  }

  const hasReflection = (database.reflections || []).some((reflection) => reflection.submissionId === submissionId);
  if (hasReflection) {
    return res.status(400).json({ error: 'Cannot cancel submission after reflection was submitted' });
  }

  database.submissions.splice(submissionIndex, 1);
  database.results = (database.results || []).filter((result) => result.submissionId !== submissionId);
  database.reflections = (database.reflections || []).filter((reflection) => reflection.submissionId !== submissionId);

  if (submission.filename) {
    const uploadedFilePath = path.join(submissionsDir, submission.filename);
    if (fs.existsSync(uploadedFilePath)) {
      fs.unlinkSync(uploadedFilePath);
    }
  }

  saveDatabase();
  res.json({ ok: true, submissionId });
});

// Step 5: Reflection answer are submitted and saved. 
app.post('/api/reflections', authRequired, (req, res) => {
  const {
    submissionId,
    assignmentId,
    learnedText,
    difficultiesText,
    wroteCodeMyself,
    aiToolUsage,
    understoodGeneratedCode,
    ownVsExternalPercent,
    reflectedOnApproach,
    revisionChangeText,
    revisionUnderstandText,
    revisionNextIterationText
  } = req.body;

  if (!submissionId || !assignmentId) {
    return res.status(400).json({ error: 'submissionId and assignmentId are required' });
  }

  const submission = database.submissions.find(s => s.id === parseInt(submissionId));
  if (!submission) {
    return res.status(404).json({ error: 'Submission not found' });
  }
  if (submission.userId !== req.user.id) {
    return res.status(403).json({ error: 'You can only add reflections to your own submissions' });
  }

  const existing = database.reflections?.find(r => r.submissionId === parseInt(submissionId));
  if (existing) {
    return res.status(400).json({ error: 'Reflection already submitted for this submission' });
  }

  const attemptNumber = getSubmissionAttemptNumber(submission);
  const isSecondAttempt = attemptNumber >= 2;

  if (isSecondAttempt) {
    const r1 = String(revisionChangeText || '').trim();
    const r2 = String(revisionUnderstandText || '').trim();
    const r3 = String(revisionNextIterationText || '').trim();
    if (!r1 || !r2 || !r3) {
      return res.status(400).json({
        error: 'Second-attempt reflection requires all three revision prompts (change after feedback, understanding, next iteration).'
      });
    }
  } else {
    const req1 = String(learnedText || '').trim();
    const req2 = String(difficultiesText || '').trim();
    if (!req1 || !req2 || wroteCodeMyself == null || wroteCodeMyself === '' ||
        !String(aiToolUsage || '').trim() || reflectedOnApproach == null || reflectedOnApproach === '') {
      return res.status(400).json({ error: 'All first-attempt reflection fields are required.' });
    }
  }

  const reflection = {
    id: (database.reflections?.length || 0) + 1,
    submissionId: parseInt(submissionId),
    assignmentId: parseInt(assignmentId),
    userId: req.user.id,
    reflectionAttempt: isSecondAttempt ? 2 : 1,
    learnedText: isSecondAttempt ? '' : (learnedText || ''),
    difficultiesText: isSecondAttempt ? '' : (difficultiesText || ''),
    wroteCodeMyself: isSecondAttempt ? null : (wroteCodeMyself != null ? parseInt(wroteCodeMyself) : null),
    aiToolUsage: isSecondAttempt ? null : (aiToolUsage || null),
    understoodGeneratedCode: isSecondAttempt ? null : (understoodGeneratedCode != null ? parseInt(understoodGeneratedCode) : null),
    ownVsExternalPercent: isSecondAttempt ? null : (ownVsExternalPercent != null ? parseInt(ownVsExternalPercent) : null),
    reflectedOnApproach: isSecondAttempt ? null : (reflectedOnApproach != null ? parseInt(reflectedOnApproach) : null),
    revisionChangeText: isSecondAttempt ? String(revisionChangeText).trim() : '',
    revisionUnderstandText: isSecondAttempt ? String(revisionUnderstandText).trim() : '',
    revisionNextIterationText: isSecondAttempt ? String(revisionNextIterationText).trim() : '',
    createdAt: new Date().toISOString()
  };
// Step 5.1: save Reflection. 
  database.reflections.push(reflection);
  saveDatabase();

  res.status(201).json(reflection);
});

app.get('/api/reflections', authRequired, (req, res) => {
  const list = req.user.role === 'teacher'
    ? (database.reflections || [])
    : (database.reflections || []).filter(r => r.userId === req.user.id);
  res.json(list);
});

app.get('/api/reflections/by-submission/:submissionId', authRequired, (req, res) => {
  const submissionId = parseInt(req.params.submissionId);
  const reflection = database.reflections?.find(r => r.submissionId === submissionId);
  if (!reflection) {
    return res.status(404).json({ error: 'Reflection not found' });
  }
  if (req.user.role !== 'teacher' && reflection.userId !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  res.json(reflection);
});

app.patch('/api/reflections/:id', authRequired, (req, res) => {
  if (req.user.role !== 'teacher') {
    return res.status(403).json({ error: 'Only teachers can assess reflections' });
  }
  const id = parseInt(req.params.id);
  const reflection = database.reflections?.find(r => r.id === id);
  if (!reflection) {
    return res.status(404).json({ error: 'Reflection not found' });
  }
  const { logicalCheck, teacherNotes } = req.body;
  if (logicalCheck !== undefined) {
    reflection.logicalCheck = logicalCheck === 'logical' || logicalCheck === 'not_logical' ? logicalCheck : null;
  }
  if (teacherNotes !== undefined) {
    reflection.teacherNotes = teacherNotes == null ? '' : String(teacherNotes);
  }
  reflection.assessedAt = new Date().toISOString();
  reflection.assessedBy = req.user.id;
  saveDatabase();
  res.json(reflection);
});

// Runner callback
app.post('/api/runner/callback', (req, res) => {
  try {
    const { submissionId, status, score, totalTests, passedTests, feedback } = req.body;
    
    console.log(`[CALLBACK] ===== RECEIVED CALLBACK =====`);
    console.log(`[CALLBACK] Full request body:`, JSON.stringify(req.body, null, 2));
    console.log(`[CALLBACK] submissionId: ${submissionId} (type: ${typeof submissionId})`);
    console.log(`[CALLBACK] status: ${status} (type: ${typeof status})`);
    console.log(`[CALLBACK] score: ${score} (type: ${typeof score})`);
    console.log(`[CALLBACK] totalTests: ${totalTests} (type: ${typeof totalTests})`);
    console.log(`[CALLBACK] passedTests: ${passedTests} (type: ${typeof passedTests})`);
    console.log(`[CALLBACK] feedback: ${feedback ? feedback.substring(0, 100) : 'none'}`);
    console.log(`[CALLBACK] Full body:`, JSON.stringify(req.body, null, 2));
    
    if (!submissionId) {
      console.error(`[CALLBACK] ERROR: Missing submissionId in request body`);
      return res.status(400).json({ error: 'Missing submissionId' });
    }
    
    // Update submission status and score
    const submission = database.submissions.find(s => s.id === parseInt(submissionId));
    if (submission) {
      // Map runner status to submission status
      // 'completed' from runner means tests ran successfully (even if some failed)
      // 'failed' from runner means execution error
      // Update status based on runner response
      // IMPORTANT: Even if status is 'failed', we should still save the score if it exists
      // (e.g., if some tests passed before failure)
      if (status === 'completed') {
        submission.status = 'completed';
      } else if (status === 'failed') {
        submission.status = 'failed';
      } else {
        submission.status = status || 'failed';
      }
      // Only save score when status is completed or failed (not processing)
      // Score 0 is a valid score and should be saved for completed/failed submissions
      // IMPORTANT: Only set score when we have a valid result from runner
      if (status === 'completed' || status === 'failed') {
        submission.score = score !== undefined && score !== null ? score : 0;
        console.log(`[CALLBACK] Set submission ${submissionId} score to: ${submission.score} (from param: ${score}, type: ${typeof score})`);
      } else {
        // Don't set score if status is still processing/queued
        console.log(`[CALLBACK] Submission ${submissionId} status is '${status}', not setting score yet`);
      }
      console.log(`[CALLBACK] Updated submission ${submissionId}: status=${submission.status}, score=${submission.score}`);
    } else {
      console.error(`[CALLBACK] ERROR: Submission ${submissionId} not found in database`);
      console.error(`[CALLBACK] Available submission IDs:`, database.submissions.map(s => s.id));
      return res.json({ ok: true, ignored: true, reason: 'submission_missing' });
    }
    
    // Create or update result
    // IMPORTANT: Always save result even if status is 'failed' - the score might still be valid
    // Score 0 is valid and should be saved and displayed
    let result = database.results.find(r => r.submissionId === parseInt(submissionId));
    const finalScore = score !== undefined && score !== null ? score : 0;
    const finalTotalTests = totalTests !== undefined && totalTests !== null ? totalTests : 0;
    const finalPassedTests = passedTests !== undefined && passedTests !== null ? passedTests : 0;
    const finalFeedback = feedback || '';
    
    if (result) {
      // Update existing result - always update, even if values are 0
      result.score = finalScore;
      result.totalTests = finalTotalTests;
      result.passedTests = finalPassedTests;
      result.feedback = finalFeedback;
      console.log(`[CALLBACK] Updated existing result for submission ${submissionId}: score=${result.score}, status=${status}`);
    } else {
      // Create new result - always create, even if score is 0
      result = {
        id: database.results.length + 1,
        submissionId: parseInt(submissionId),
        score: finalScore,
        totalTests: finalTotalTests,
        passedTests: finalPassedTests,
        feedback: finalFeedback,
        createdAt: new Date().toISOString()
      };
      database.results.push(result);
      console.log(`[CALLBACK] Created new result for submission ${submissionId}: score=${result.score}, status=${status}`);
    }
    
    saveDatabase();
    console.log(`[CALLBACK] Database saved for submission ${submissionId}`);
    
    res.json({ ok: true, submissionId: parseInt(submissionId) });
  } catch (error) {
    console.error(`[CALLBACK] EXCEPTION:`, error);
    console.error(`[CALLBACK] Stack:`, error.stack);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Serve React app - handle root and all other routes
app.get('/', (req, res) => {
  const indexPath = path.join(frontendDistPath, 'index.html');
  console.log('Serving index.html from:', indexPath);
  res.sendFile(indexPath);
});

// IMPORTANT: Catch-all route must be LAST, after all API routes
app.get('*', (req, res) => {
  // Skip API routes - they should have been handled above
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  const indexPath = path.join(frontendDistPath, 'index.html');
  console.log('Catch-all route - serving index.html from:', indexPath);
  res.sendFile(indexPath);
});

// Start server
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
  console.log(`=== BACKEND STARTED ===`);
  console.log(`Backend server running on http://${HOST}:${PORT}`);
  console.log(`API available at http://${HOST}:${PORT}/api`);
  console.log(`RUNNER_URL configured as: ${RUNNER_URL}`);
  console.log(`Callback endpoint: POST http://${HOST}:${PORT}/api/runner/callback`);
  console.log(`Listening on all interfaces (0.0.0.0) for callbacks from runner`);
});
