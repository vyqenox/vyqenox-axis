import "./config.js?v=20260824-22";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-analytics.js";
import { createUserWithEmailAndPassword, deleteUser, getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { collection, doc, getDoc, getFirestore, serverTimestamp, updateDoc, writeBatch } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const firebaseConfigResponse = await fetch('/firebase-config', { cache: 'no-store' });
if (!firebaseConfigResponse.ok) {
  throw new Error(`Firebase config could not be loaded (${firebaseConfigResponse.status})`);
}
const firebaseConfig = await firebaseConfigResponse.json();

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
window.firebaseApp = firebaseApp;
window.auth = auth;
window.db = db;
try {
  window.analytics = getAnalytics(firebaseApp);
} catch (error) {
  window.analytics = null;
}

const toast = document.getElementById('toast');
const pageContent = document.querySelector('.page-content');
const overviewMarkup = pageContent.innerHTML.replace(/documents expiring soon/gi, 'staff records needing review').replace(/documents/gi, 'records');
const config = window.APP_CONFIG;
const modalBackdrop = document.getElementById('modalBackdrop');
const recordForm = document.getElementById('recordForm');
const authScreen = document.getElementById('authScreen');
const authForm = document.getElementById('authForm');
const authSwitch = document.getElementById('authSwitch');
const appFooter = document.querySelector('.app-footer');
const authSubmit = document.querySelector('.auth-submit');
const nameInput = authForm.elements.name;
const schoolInput = authForm.elements.school;
let authMode = 'login';
let currentUser = null;
let accountSetupInProgress = false;
localStorage.removeItem('vyqenox-pivot-records');
localStorage.removeItem('vyqenox-pivot-documents');
localStorage.removeItem('pivot-documents');
localStorage.removeItem('pivot-account');
const getInitials = (name) => name.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
const syncUser = () => {
  if (!currentUser) return;
  document.querySelectorAll('[data-user-name]').forEach((element) => { element.textContent = currentUser.name; });
  document.querySelectorAll('[data-user-first-name]').forEach((element) => { element.textContent = currentUser.name.split(' ')[0]; });
  document.querySelectorAll('[data-user-role]').forEach((element) => { element.textContent = currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1); });
  document.querySelectorAll('[data-user-initials]').forEach((element) => { element.textContent = getInitials(currentUser.name); });
  document.querySelector('.school-switcher strong').textContent = currentUser.school;
  document.querySelector('.school-logo').textContent = getInitials(currentUser.school).slice(0, 1);
};
const loadUserWorkspace = async (firebaseUser) => {
  const userSnapshot = await getDoc(doc(db, 'users', firebaseUser.uid));
  if (!userSnapshot.exists() || userSnapshot.data().uid !== firebaseUser.uid) throw Object.assign(new Error('User profile is missing.'), { code: 'axis/missing-user-profile' });

  const userProfile = userSnapshot.data();
  const activeSchoolId = userProfile.activeSchoolId;
  if (!activeSchoolId) throw Object.assign(new Error('Active school is missing.'), { code: 'axis/missing-active-school' });

  const schoolRef = doc(db, 'schools', activeSchoolId);
  const [schoolSnapshot, memberSnapshot] = await Promise.all([
    getDoc(schoolRef),
    getDoc(doc(db, 'schools', activeSchoolId, 'members', firebaseUser.uid))
  ]);
  if (!schoolSnapshot.exists()) throw Object.assign(new Error('School is missing.'), { code: 'axis/missing-school' });
  if (!memberSnapshot.exists() || !memberSnapshot.data().role || memberSnapshot.data().status !== 'active') throw Object.assign(new Error('School membership is missing or inactive.'), { code: 'axis/missing-membership' });

  const school = schoolSnapshot.data();
  const membership = memberSnapshot.data();
  if (!school.name) throw Object.assign(new Error('School name is missing.'), { code: 'axis/missing-school' });

  return {
    uid: firebaseUser.uid,
    name: userProfile.displayName || firebaseUser.email.split('@')[0],
    email: userProfile.email || firebaseUser.email,
    activeSchoolId,
    role: membership.role,
    school: school.name
  };
};
const getAuthErrorMessage = (error, phase = 'login') => {
  const code = error?.code || '';
  if (code === 'auth/email-already-in-use') return 'An account already exists for this email. Log in instead.';
  if (code === 'auth/invalid-email') return 'Enter a valid email address.';
  if (code === 'auth/weak-password') return 'Choose a stronger password with at least 6 characters.';
  if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') return 'Email or password is incorrect.';
  if (code === 'auth/user-not-found') return 'No account was found for this email. Create an account first.';
  if (code === 'auth/network-request-failed' || code === 'unavailable' || error instanceof TypeError) return 'Connection problem. Check your internet and try again.';
  if (code === 'axis/missing-user-profile') return 'Your account profile is missing. Contact your workspace administrator.';
  if (code === 'axis/missing-active-school' || code === 'axis/missing-school') return 'Your school workspace could not be found. Contact your workspace administrator.';
  if (code === 'axis/missing-membership') return 'Your school access is not set up. Contact your workspace administrator.';
  if (code === 'permission-denied' || code.startsWith('firestore/')) return phase === 'signup'
    ? 'Your account was created, but school setup could not be saved. Check Firestore access and try again.'
    : 'Your school workspace could not be loaded. Check your connection or contact an administrator.';
  return phase === 'signup' ? 'Unable to finish account setup. Check your details and try again.' : 'Unable to sign in. Check your details and try again.';
};
const showApp = () => {
  document.body.classList.remove('auth-checking');
  authScreen.hidden = true;
  document.querySelector('.app-shell').hidden = false;
  appFooter.hidden = false;
  syncUser();
};
const showAuth = () => {
  document.body.classList.remove('auth-checking');
  authMode = 'login';
  authForm.reset();
  document.getElementById('authTitle').textContent = 'Welcome back';
  document.getElementById('authSubtitle').textContent = 'Sign in to your Vyqenox Axis workspace.';
  document.querySelector('.auth-name').hidden = true;
  document.querySelector('.auth-confirm').hidden = true;
  nameInput.required = false;
  schoolInput.required = false;
  authSubmit.textContent = 'Log in';
  authSwitch.innerHTML = 'New to Axis? <b>Create an account</b>';
  authScreen.hidden = false;
  document.querySelector('.app-shell').hidden = true;
  appFooter.hidden = true;
};
const createSchoolWorkspace = async (firebaseUser, displayName, schoolName) => {
  const schoolRef = doc(collection(db, 'schools'));
  const userRef = doc(db, 'users', firebaseUser.uid);
  const memberRef = doc(db, 'schools', schoolRef.id, 'members', firebaseUser.uid);
  const batch = writeBatch(db);

  batch.set(schoolRef, {
    name: schoolName,
    createdBy: firebaseUser.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    currency: 'INR',
    country: 'India'
  });
  batch.set(memberRef, {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    displayName,
    role: 'director',
    status: 'active',
    joinedAt: serverTimestamp()
  });
  batch.set(userRef, {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    displayName,
    activeSchoolId: schoolRef.id,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  await batch.commit();
};
onAuthStateChanged(auth, async (firebaseUser) => {
  if (accountSetupInProgress) return;
  if (!firebaseUser) {
    currentUser = null;
    localStorage.removeItem('pivot-user');
    showAuth();
    return;
  }

  try {
    const workspaceUser = await loadUserWorkspace(firebaseUser);
    if (auth.currentUser?.uid !== firebaseUser.uid) return;
    currentUser = workspaceUser;
    localStorage.setItem('pivot-user', JSON.stringify(workspaceUser));
    showApp();
  } catch (error) {
    console.error('Unable to load the authenticated Axis workspace:', error);
    const message = getAuthErrorMessage(error);
    currentUser = null;
    localStorage.removeItem('pivot-user');
    try {
      await signOut(auth);
    } catch (signOutError) {
      console.error('Unable to sign out after workspace loading failed:', signOutError);
    }
    showAuth();
    showToast(message);
  }
});
document.title = config.productName;
document.querySelectorAll('[data-config]').forEach((element) => { element.textContent = config[element.dataset.config]; });
document.querySelectorAll('[data-config-link]').forEach((element) => { element.href = config[element.dataset.configLink]; });
const legalSections = {
  privacy: [['Introduction', `${config.companyName} provides and maintains ${config.productName}, an internal administration and finance platform for schools. This policy explains how information is handled when the platform is used.`], ['Information collected by the platform', 'The platform may store account details, staff records, attendance, leave, payroll, financial and operational records, audit events, and information submitted through uploaded documents.'], ['How information is used', 'Information is used to operate school workflows, calculate attendance and payroll, generate reports, maintain audit logs, provide notifications, and support authorized administrators.'], ['Data access and role-based permissions', 'Access is limited by school tenant, assigned role, and configured permissions. Users should only access information required for their responsibilities.'], ['Data security practices', `${config.companyName} uses access controls, validation, audit logging, and reasonable technical and organizational safeguards. Sensitive credentials and configuration values should never be shared through the interface.`], ['Data storage and retention', 'Records are retained according to the school’s configured retention requirements and applicable obligations. Schools should configure retention and deletion practices appropriate to their policies.'], ['Third-party services', 'External services such as email, file storage, payment processing, or messaging are optional integrations and are only used when enabled by the school.'], ['User responsibilities', 'Users are responsible for maintaining account security, entering accurate records, and using the platform only for authorized school operations.'], ['Changes to this Privacy Policy', `${config.companyName} may update this policy as the platform changes. The effective version should be reviewed from this page.`], ['Contact information', `For privacy questions, contact ${config.privacyContactEmail}. ${config.companyName} provides and maintains the platform.`]],
  terms: [['Acceptance of terms', `By using ${config.productName}, you agree to these terms and any school policies governing your account.`], ['Platform usage', 'The platform is provided for authorized internal school administration, finance, staff, attendance, leave, payroll, reporting, and rule-based automation workflows.'], ['User accounts and security', 'Each user must use an assigned account, protect authentication details, and promptly report suspected unauthorized access.'], ['User responsibilities', 'Users must keep records accurate, respect role boundaries, protect confidential information, and follow applicable laws and school policies.'], ['Authorized and prohibited usage', 'Users may not misuse the platform, bypass permissions, interfere with service operation, or access another school tenant. The application does not support file uploads.'], ['Data responsibility', 'The school and its authorized users remain responsible for the information they enter, the permissions they configure, and the records they retain.'], ['Service availability', `${config.companyName} aims to provide reliable service but does not guarantee uninterrupted availability, particularly during maintenance or third-party outages.`], ['Updates and modifications', `${config.companyName} may improve, modify, or discontinue platform features with reasonable notice where practical.`], ['Intellectual property', `${config.companyName} owns or licenses the platform software, design, and related materials. School data remains under the school’s control subject to its agreements and applicable law.`], ['Limitation of responsibility', 'The platform supports administrative workflows but does not replace professional legal, financial, payroll, or compliance advice.'], ['Termination or suspension', 'Access may be suspended for security, misuse, non-payment, or violation of these terms, subject to applicable agreements.'], ['Changes to the Terms', 'Updated terms become effective when published on this page. Continued use after an update indicates acceptance.']],
};

const renderLegal = (type) => {
  legalSections.privacy[1][1] = 'The platform stores account details, staff information, attendance, leave, payroll, financial, and operational records required for enabled school workflows. It does not collect or retain files.';
  legalSections.privacy[5][1] = 'Operational records are retained according to the school’s configured retention requirements and applicable obligations. Files are not retained by this application.';
  legalSections.privacy[6][1] = 'External services such as email, payment processing, or messaging are optional integrations and are only used when enabled by the school. File storage services are not used by this application.';
  legalSections.terms[4][1] = 'Users may not misuse the platform, bypass permissions, interfere with service operation, or access another school tenant. This application does not support file uploads.';
  legalSections.privacy.forEach((section) => { section[1] = section[1].replace(/documents?/gi, 'additional files'); });
  legalSections.terms.forEach((section) => { section[1] = section[1].replace(/documents?/gi, 'additional files'); });
  const isAbout = type === 'about';
  const sections = isAbout ? '' : legalSections[type].map(([heading, text]) => `<section><h2>${heading}</h2><p>${text}</p></section>`).join('');
  pageContent.innerHTML = isAbout ? `<section class="legal-page"><p class="eyebrow">COMPANY & PRODUCT</p><h1>About ${config.productName}</h1><p class="subhead">A modern School Administration & Finance Management System designed to simplify internal operations, staff management, attendance, leave management, payroll, finance, reporting, and rule-based automation.</p><div class="about-grid"><article class="about-card"><h2>Developed and maintained by ${config.companyName}</h2><p>${config.companyName} is an independent software technology company creating original digital products designed to solve real problems.</p><a class="primary-button about-link" href="${config.companyWebsite}" target="_blank" rel="noopener noreferrer">Visit ${config.companyName} ↗</a></article><article class="about-card"><h2>Version information</h2><strong>${config.productVersion}</strong><small>© ${config.copyrightYear} ${config.companyName}. All rights reserved.</small><h2>Credits</h2><ul class="credits-list"><li>Founders: ${config.credits.founders.length ? config.credits.founders.join(', ') : 'To be announced'}</li><li>Developers: ${config.credits.developers.length ? config.credits.developers.join(', ') : `${config.companyName} product team`}</li><li>Contributors: ${config.credits.contributors.length ? config.credits.contributors.join(', ') : 'To be announced'}</li><li>Acknowledgments: ${config.credits.acknowledgments.join(', ')}</li></ul></article></div></section>` : `<section class="legal-page"><p class="eyebrow">${type === 'privacy' ? 'LEGAL / PRIVACY' : 'LEGAL / TERMS'}</p><h1>${type === 'privacy' ? 'Privacy Policy' : 'Terms of Service'}</h1><p class="subhead">Last updated August 24, 2026</p>${sections}</section>`;
  document.querySelector('.breadcrumb strong').textContent = isAbout ? 'About / Credits' : type === 'privacy' ? 'Privacy Policy' : 'Terms of Service';
};

const handleHashRoute = () => {
  const route = window.location.hash.replace('#/', '');
  if (route === 'privacy-policy' || route === 'terms-of-service' || route === 'about') renderLegal(route === 'about' ? 'about' : route === 'privacy-policy' ? 'privacy' : 'terms');
};
window.addEventListener('hashchange', handleHashRoute);
handleHashRoute();

const moduleViews = {
  Finance: { eyebrow: 'FINANCE OPERATIONS', title: 'Finance', description: 'Track income, expenses, vendors, and budgets in one place.', action: 'Record transaction', stats: [['Income this month', '$84,250.00', '8.4% vs last month', 'positive'], ['Expenses this month', '$61,832.18', '3.2% vs last month', 'negative'], ['Outstanding bills', '$12,480.00', '8 invoices', 'warning'], ['Budget used', '67.4%', 'Across 12 categories', 'positive']], tabs: ['Transactions', 'Vendors', 'Budgets'], headers: ['DESCRIPTION', 'CATEGORY', 'DATE', 'AMOUNT', 'STATUS'], rows: [['Tuition deposit', 'Income', 'Aug 24, 2026', '+$24,500.00', 'Paid'], ['Electricity bill', 'Utilities', 'Aug 23, 2026', '-$1,240.50', 'Paid'], ['Office supplies', 'Stationery', 'Aug 22, 2026', '-$428.75', 'Pending'], ['Facility rental', 'Other income', 'Aug 18, 2026', '+$3,200.00', 'Paid']] },
  Staff: { eyebrow: 'PEOPLE OPERATIONS', title: 'Staff directory', description: 'Keep employment records, documents, and departments current.', action: 'Add staff member', stats: [['Active staff', '124', '4 new this year', 'positive'], ['On leave today', '8', '3 approved requests', 'warning'], ['Documents expiring', '3', 'Before Sep 1, 2026', 'negative'], ['Departments', '11', 'All operational', 'positive']], tabs: ['All staff', 'Departments', 'Documents'], headers: ['STAFF MEMBER', 'ROLE', 'DEPARTMENT', 'JOINED', 'STATUS'], rows: [['Maya Patel', 'Principal', 'Leadership', 'Jan 12, 2019', 'Active'], ['Jordan Lee', 'Accountant', 'Finance', 'Mar 04, 2022', 'Active'], ['Sam Rivera', 'Administrator', 'Operations', 'Jul 18, 2021', 'Active'], ['Taylor Brooks', 'Support staff', 'Facilities', 'Nov 23, 2023', 'On leave']] },
  Attendance: { eyebrow: 'STAFF OPERATIONS', title: 'Attendance', description: 'Review today’s presence, late arrivals, leave, and working patterns.', action: 'Mark attendance', stats: [['Present today', '86', '72% of staff', 'positive'], ['Late arrivals', '12', '2 above monthly average', 'warning'], ['On leave', '8', 'Approved leave', 'positive'], ['Absent', '5', 'Needs review', 'negative']], tabs: ['Today', 'Calendar', 'Reports'], headers: ['STAFF MEMBER', 'CHECK-IN', 'CHECK-OUT', 'STATUS', 'HOURS'], rows: [['Maya Patel', '08:42 AM', '05:16 PM', 'Present', '8h 34m'], ['Jordan Lee', '09:17 AM', '05:02 PM', 'Late', '7h 45m'], ['Sam Rivera', '-', '-', 'On leave', '-'], ['Taylor Brooks', '-', '-', 'Absent', '-']] },
  Payroll: { eyebrow: 'PAYROLL OPERATIONS', title: 'Payroll', description: 'Prepare, review, and protect monthly salary processing.', action: 'Start payroll run', stats: [['Next payroll', '$42,500.00', 'Due in 6 days', 'warning'], ['Last processed', '$41,980.00', 'July 31, 2026', 'positive'], ['Paid staff', '118', '95.2% of staff', 'positive'], ['Adjustments', '6', 'Awaiting review', 'negative']], tabs: ['Current period', 'Payments', 'Salary structures'], headers: ['PAYROLL PERIOD', 'STAFF', 'GROSS PAY', 'DEDUCTIONS', 'STATUS'], rows: [['August 2026', '124 staff', '$46,820.00', '-$4,320.00', 'Draft'], ['July 2026', '122 staff', '$45,210.00', '-$3,230.00', 'Finalized'], ['June 2026', '121 staff', '$44,860.00', '-$3,110.00', 'Finalized']] },
  Reports: { eyebrow: 'REPORTING CENTER', title: 'Reports', description: 'Build clear operational reports for decisions and audit trails.', action: 'Create report', stats: [['Reports this month', '18', '6 scheduled', 'positive'], ['Financial exports', '7', 'PDF and Excel ready', 'positive'], ['Attendance rate', '86%', 'Across all departments', 'positive'], ['Audit events', '248', 'Last 30 days', 'warning']], tabs: ['Favorites', 'Financial', 'Staff'], headers: ['REPORT', 'TYPE', 'LAST GENERATED', 'OWNER', 'ACTION'], rows: [['Monthly financial summary', 'Finance', 'Aug 24, 2026', 'Alex Morgan', 'Export'], ['Staff attendance summary', 'Attendance', 'Aug 23, 2026', 'HR Admin', 'Export'], ['Budget vs actual', 'Finance', 'Aug 20, 2026', 'Jordan Lee', 'Export'], ['Payroll expense report', 'Payroll', 'Jul 31, 2026', 'Jordan Lee', 'Export']] },
  Automation: { eyebrow: 'RULE-BASED OPERATIONS', title: 'Automation', description: 'Use schedules and configurable rules to keep work moving.', action: 'Create rule', stats: [['Active rules', '8', 'All schedules healthy', 'positive'], ['Alerts this month', '23', '4 need attention', 'warning'], ['Scheduled tasks', '12', 'Next run in 2h', 'positive'], ['Failed runs', '0', 'Last 30 days', 'positive']], tabs: ['Rules', 'Scheduled tasks', 'Alerts'], headers: ['AUTOMATION RULE', 'TRIGGER', 'LAST RUN', 'OWNER', 'STATUS'], rows: [['Budget threshold alert', 'At 90% of budget', 'Today, 08:00', 'Finance', 'Active'], ['Document expiry reminder', '30 days before expiry', 'Today, 06:00', 'HR Admin', 'Active'], ['Payroll due reminder', '6 days before payroll', 'Aug 18, 2026', 'Accountant', 'Active'], ['Consecutive absence alert', '3 working days', 'Aug 21, 2026', 'Principal', 'Active']] },
  Settings: { eyebrow: 'SYSTEM ADMINISTRATION', title: 'Settings', description: 'Configure your school workspace, roles, permissions, and operating rules.', action: 'Save changes', stats: [['Workspace', 'Riverside Academy', 'School ID RA-001', 'positive'], ['Timezone', 'UTC-05:00', 'Eastern Time', 'positive'], ['Role groups', '6', '14 permissions configured', 'positive'], ['Data retention', '7 years', 'Audit history enabled', 'warning']], tabs: ['School profile', 'Roles & permissions', 'Rules'], headers: ['SETTING', 'CURRENT VALUE', 'LAST UPDATED', 'OWNER', 'STATUS'], rows: [['School profile', 'Riverside Academy', 'Aug 20, 2026', 'Alex Morgan', 'Configured'], ['Working hours', '08:30 AM - 05:00 PM', 'Aug 18, 2026', 'HR Admin', 'Configured'], ['Late grace period', '10 minutes', 'Aug 18, 2026', 'HR Admin', 'Configured'], ['Overtime calculation', 'Enabled', 'Aug 12, 2026', 'Director', 'Configured']] }
};
moduleViews.Staff.tabs = ['All staff', 'Departments', 'Payroll'];
moduleViews.Staff.description = 'Keep employment records, payroll details, and departments current.';
moduleViews.Automation.rows[1] = ['Leave balance reminder', 'Monthly schedule', 'Today, 06:00', 'HR Admin', 'Active'];
Object.values(moduleViews).forEach((view) => { view.stats = view.stats.map(([label]) => [label, label.includes('rate') || label.includes('used') ? '0%' : '0', 'No data yet', 'positive']); view.rows = []; });
const clearDemoWorkspace = () => {
  localStorage.removeItem('vyqenox-pivot-records');
  localStorage.removeItem('northstar-new-school');
  localStorage.removeItem('northstar-school');
  const replaceCurrency = (text) => text.replace(/\$/g, config.currencySymbol);
  const textWalker = document.createTreeWalker(pageContent, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (textWalker.nextNode()) textNodes.push(textWalker.currentNode);
  textNodes.forEach((node) => { node.nodeValue = replaceCurrency(node.nodeValue).replace(/Riverside Academy/g, currentUser?.school || 'Your school').replace(/Alex Morgan/g, currentUser?.name || 'Your name'); });
  pageContent.querySelectorAll('.metric-value').forEach((element) => { element.textContent = `${config.currencySymbol}0.00`; });
  pageContent.querySelectorAll('.metric-foot').forEach((element) => { element.textContent = 'No data yet'; });
  pageContent.querySelectorAll('.attendance-stats b').forEach((element) => { element.innerHTML = '0 <small>0%</small>'; });
  pageContent.querySelector('.ring strong')?.replaceChildren('0%');
  pageContent.querySelector('.ring span')?.replaceChildren('no data');
  pageContent.querySelector('.transactions-panel tbody')?.replaceChildren(Object.assign(document.createElement('tr'), { innerHTML: '<td colspan="5" class="empty-state">No transactions recorded yet.</td>' }));
  pageContent.querySelector('.alerts-panel .alert-count')?.replaceChildren('0');
  pageContent.querySelector('.alerts-panel .alert-list')?.replaceChildren(Object.assign(document.createElement('p'), { className: 'empty-state', textContent: 'No alerts right now.' }));
  pageContent.querySelectorAll('.income-line,.expense-line').forEach((path) => { path.setAttribute('d', 'M0 180 L700 180'); });
};

const renderModule = (page) => {
  const view = moduleViews[page];
  if (!view) return;
  pageContent.innerHTML = `<section class="module-heading"><div><p class="eyebrow">${view.eyebrow}</p><h1>${view.title}</h1><p class="subhead">${view.description}</p></div><button class="primary-button module-action">＋ <span>${view.action}</span></button></section><section class="module-stats">${view.stats.map(([label, value, foot, tone]) => `<article class="metric-card module-stat accent-${tone === 'positive' ? 'green' : tone === 'negative' ? 'coral' : 'yellow'}"><span class="metric-label">${label.toUpperCase()}</span><strong class="metric-value">${value}</strong><div class="metric-foot ${tone}"><b>${foot}</b></div></article>`).join('')}</section><section class="panel module-table"><div class="module-tabs">${view.tabs.map((tab, index) => `<button class="${index === 0 ? 'active' : ''}">${tab}</button>`).join('')}<div class="table-actions"><button class="outline-button">⇩ <span>Export</span></button><button class="outline-button">⌕ <span>Search</span></button></div></div><div class="table-wrap"><table><thead><tr>${view.headers.map((header) => `<th>${header}</th>`).join('')}</tr></thead><tbody>${view.rows.length ? view.rows.map((row) => `<tr>${row.map((cell, index) => `<td class="${index === row.length - 2 ? 'amount' : ''}">${index === 0 ? `<strong>${cell}</strong>` : index === row.length - 1 ? `<span class="status paid">${cell}</span>` : cell}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${view.headers.length}" class="empty-state">No records available yet.</td></tr>`}</tbody></table></div></section><section class="module-note"><span class="note-icon">⌘</span><span><strong>Local workspace mode</strong><small>Connect your API to load live school data.</small></span><button class="text-button">View integration checklist →</button></section>`;
  pageContent.querySelectorAll('.metric-value').forEach((element) => { if (element.textContent.includes('$')) element.textContent = element.textContent.replace(/\$/g, config.currencySymbol); });
  sanitizeOperationalCopy();
};

const openRecordModal = (title) => {
  document.getElementById('modalTitle').textContent = title;
  recordForm.reset();
  recordForm.date.value = new Date().toISOString().slice(0, 10);
  modalBackdrop.hidden = false;
  recordForm.name.focus();
};
const closeRecordModal = () => { modalBackdrop.hidden = true; };
const sanitizeOperationalCopy = () => {
  const walker = document.createTreeWalker(pageContent, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => { node.nodeValue = node.nodeValue.replace(/\bdocuments?\b/gi, 'records').replace(/\bupload(?:ed|s)?\b/gi, 'added'); });
};
const showToast = (message) => {
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => toast.classList.remove('show'), 2600);
};
const panelBackdrop = document.getElementById('panelBackdrop');
const utilityBody = document.getElementById('utilityBody');
const closeUtilityPanel = () => { panelBackdrop.hidden = true; utilityBody.innerHTML = ''; };
const openUtilityPanel = (title, eyebrow, body) => {
  document.getElementById('utilityTitle').textContent = title;
  document.getElementById('utilityEyebrow').textContent = eyebrow;
  utilityBody.innerHTML = body.replace(/Documents expiring soon/gi, 'Staff records needing review').replace(/documents/gi, 'records').replace(/document uploads/gi, 'file uploads');
  panelBackdrop.hidden = false;
};
const openSearchPanel = () => openUtilityPanel('Search records', 'GLOBAL SEARCH', '<div class="utility-search"><input id="utilitySearchInput" placeholder="Search staff, transactions, or reports" autofocus /><button class="primary-button" id="utilitySearchButton">Search</button></div><p class="utility-empty" id="searchResult">Type a keyword to search this local workspace.</p>');
const openNotificationsPanel = () => openUtilityPanel('Notifications', '4 NEED ATTENTION', '<div class="utility-list"><button><span class="utility-icon">!</span><span><strong>Budget threshold reached</strong><small>Utilities is at 92% of its monthly budget</small></span></button><button><span class="utility-icon">◷</span><span><strong>Documents expiring soon</strong><small>Review 3 staff documents before September 1</small></span></button><button><span class="utility-icon">$</span><span><strong>Payroll processing due</strong><small>October payroll is due in 6 days</small></span></button><button><span class="utility-icon">✓</span><span><strong>Leave requests pending</strong><small>4 requests are waiting for approval</small></span></button></div>');
const openProfilePanel = () => openUtilityPanel(currentUser?.name || 'Account', 'ACCOUNT', '<div class="utility-list"><button data-utility-action="profile-settings"><span class="utility-icon">◎</span><span><strong>Profile settings</strong><small>Manage your account details</small></span></button><button data-utility-action="security"><span class="utility-icon">⌕</span><span><strong>Security</strong><small>Authentication and access preferences</small></span></button><button data-utility-action="sign-out"><span class="utility-icon">↪</span><span><strong>Sign out</strong><small>End this local session</small></span></button></div>');
const openSchoolPanel = () => openUtilityPanel(currentUser?.school || 'Active school', 'ACTIVE SCHOOL', '<p class="utility-empty">School access is managed by your active workspace membership.</p>');
const openProfileSettings = () => openUtilityPanel('Profile settings', 'ACCOUNT', `<form class="utility-form" id="profileForm"><label>Full name<input name="name" value="${currentUser?.name || ''}" required /></label><label>Role<input name="role" value="${currentUser?.role || ''}" readonly /></label><label>Work email<input name="email" type="email" value="${currentUser?.email || ''}" readonly /></label><div class="utility-actions"><button type="button" class="outline-button" data-utility-action="back-profile">Back</button><button type="submit" class="primary-button">Save profile</button></div></form>`);
const openSecurityPanel = () => openUtilityPanel('Security', 'ACCOUNT', '<form class="utility-form" id="securityForm"><label>Current password<input type="password" required /></label><label>New password<input type="password" minlength="8" required /></label><label>Confirm password<input type="password" minlength="8" required /></label><div class="utility-actions"><button type="button" class="outline-button" data-utility-action="back-profile">Back</button><button type="submit" class="primary-button">Update password</button></div></form>');
window.openProfilePanel = openProfilePanel;
window.openSchoolPanel = openSchoolPanel;
document.getElementById('profileTrigger')?.addEventListener('click', openProfilePanel);
const openDatePanel = () => openUtilityPanel('Date range', 'FILTER OVERVIEW', '<div class="utility-form"><label>From<input id="dateFrom" type="date" value="2026-08-18" /></label><label>To<input id="dateTo" type="date" value="2026-08-24" /></label></div><div class="utility-actions"><button class="outline-button" id="dateCancel">Cancel</button><button class="primary-button" id="dateApply">Apply range</button></div>');
const openReportPanel = (title) => openUtilityPanel(title, 'REPORT VIEW', `<p class="utility-empty">This report is ready to display connected records. Choose a date range or connect the API to load live results.</p><div class="utility-actions"><button class="primary-button" id="reportExport">Export report</button></div>`);

document.querySelectorAll('.nav-item').forEach((item) => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((navItem) => navItem.classList.remove('active'));
    item.classList.add('active');
    const page = item.dataset.page;
    document.querySelector('.breadcrumb strong').textContent = page;
    if (page === 'Overview') { pageContent.innerHTML = overviewMarkup; sanitizeOperationalCopy(); clearDemoWorkspace(); bindOverviewEvents(); }
    else renderModule(page);
    if (page !== 'Overview') showToast(`${page} module selected`);
    document.getElementById('sidebar').classList.remove('open');
  });
});

document.getElementById('menuToggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

document.querySelector('[aria-label="Search"]')?.addEventListener('click', openSearchPanel);
document.querySelector('[aria-label="Notifications"]')?.addEventListener('click', openNotificationsPanel);
document.querySelector('[aria-label="User menu"]')?.addEventListener('click', (event) => { event.stopPropagation(); closeUtilityPanel(); openProfilePanel(); });
document.querySelector('.top-avatar')?.addEventListener('click', (event) => { event.stopPropagation(); closeUtilityPanel(); openProfilePanel(); });
document.querySelector('.school-switcher')?.addEventListener('click', (event) => { event.stopPropagation(); closeUtilityPanel(); openSchoolPanel(); });
document.querySelector('.sidebar-footer')?.addEventListener('click', () => openUtilityPanel('Help center', 'SUPPORT', '<p class="utility-empty">Help resources will appear here when support services are connected.</p><div class="utility-actions"><button class="primary-button" id="contactSupport">Contact support</button></div>'));
document.addEventListener('click', (event) => {
  if (event.target.closest('[aria-label="Search"]')) openSearchPanel();
  else if (event.target.closest('[aria-label="Notifications"]')) openNotificationsPanel();
  else if (event.target.closest('[aria-label="User menu"], .top-avatar')) openProfilePanel();
  else if (event.target.closest('.school-switcher')) openSchoolPanel();
  else if (event.target.closest('.sidebar-footer')) openUtilityPanel('Help center', 'SUPPORT', '<p class="utility-empty">Help resources will appear here when support services are connected.</p><div class="utility-actions"><button class="primary-button" id="contactSupport">Contact support</button></div>');
});
document.addEventListener('click', (event) => {
  const target = event.target.closest('[aria-label="Search"], [aria-label="Notifications"], [aria-label="User menu"], .top-avatar, .school-switcher');
  if (!target) return;
  event.stopPropagation();
  closeUtilityPanel();
  if (target.matches('[aria-label="Search"]')) openSearchPanel();
  else if (target.matches('[aria-label="Notifications"]')) openNotificationsPanel();
  else if (target.matches('[aria-label="User menu"], .top-avatar')) openProfilePanel();
  else openSchoolPanel();
}, true);
document.querySelectorAll('[role="button"]').forEach((control) => control.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); control.click(); }
}));

const bindOverviewEvents = () => {
  document.getElementById('addButton')?.addEventListener('click', () => openRecordModal('Quick add record'));
  document.getElementById('dateButton')?.addEventListener('click', openDatePanel);
  document.querySelectorAll('.segmented button').forEach((button) => button.addEventListener('click', () => { document.querySelectorAll('.segmented button').forEach((range) => range.classList.remove('active')); button.classList.add('active'); showToast(`Showing ${button.dataset.range} cash flow`); }));
  document.querySelectorAll('.alert-item').forEach((item) => item.addEventListener('click', () => showToast(item.querySelector('strong').textContent)));
  document.querySelectorAll('.text-button').forEach((button) => button.addEventListener('click', () => openReportPanel(button.textContent.replace('→', '').trim())));
};

pageContent.addEventListener('click', (event) => {
  const action = event.target.closest('.module-action');
  const tab = event.target.closest('.module-tabs > button');
  const tableAction = event.target.closest('.module-table .outline-button');
  const integration = event.target.closest('.module-note .text-button');
  const more = event.target.closest('.more-button');
  if (action) openRecordModal(action.textContent.replace('＋', '').trim());
  if (tab) { document.querySelectorAll('.module-tabs > button').forEach((item) => item.classList.remove('active')); tab.classList.add('active'); showToast(`${tab.textContent} view selected`); }
  if (tableAction) showToast(`${tableAction.textContent.trim()} is ready for local data.`);
  if (integration) showToast('API integration checklist is ready for your backend details.');
  if (more) openReportPanel('Attendance report');
});
document.getElementById('modalClose').addEventListener('click', closeRecordModal);
document.getElementById('modalCancel').addEventListener('click', closeRecordModal);
modalBackdrop.addEventListener('click', (event) => { if (event.target === modalBackdrop) closeRecordModal(); });
panelBackdrop.addEventListener('click', (event) => { if (event.target === panelBackdrop) closeUtilityPanel(); });
document.getElementById('utilityClose').addEventListener('click', closeUtilityPanel);
panelBackdrop.addEventListener('click', async (event) => {
  if (event.target.id === 'utilitySearchButton') { const value = document.getElementById('utilitySearchInput').value.trim(); document.getElementById('searchResult').textContent = value ? `Search queued for “${value}”. Connect the API to search live records.` : 'Enter a keyword to search this local workspace.'; }
  const utilityAction = event.target.closest('[data-utility-action]');
  if (utilityAction) {
    const action = utilityAction.dataset.utilityAction;
    if (action === 'profile-settings') openProfileSettings();
    else if (action === 'security') openSecurityPanel();
    else if (action === 'sign-out') {
      try {
        await signOut(auth);
        currentUser = null;
        localStorage.removeItem('pivot-user');
        closeUtilityPanel();
        showAuth();
        showToast('You have been signed out.');
      } catch (error) {
        console.error('Unable to sign out:', error);
        showToast('Unable to sign out. Please try again.');
      }
    }
    else if (action === 'back-profile') openProfilePanel();
  }
  if (event.target.id === 'dateCancel') closeUtilityPanel();
  if (event.target.id === 'dateApply') { showToast(`Showing ${document.getElementById('dateFrom').value} to ${document.getElementById('dateTo').value}`); closeUtilityPanel(); }
  if (event.target.id === 'reportExport') showToast('Report export is ready for connected data.');
  if (event.target.id === 'contactSupport') showToast('Support contact is ready for your support email.');
});
panelBackdrop.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (event.target.id === 'profileForm') {
    const name = new FormData(event.target).get('name').trim();
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), { displayName: name, updatedAt: serverTimestamp() });
      await updateProfile(auth.currentUser, { displayName: name });
      currentUser = { ...currentUser, name };
      localStorage.setItem('pivot-user', JSON.stringify(currentUser));
      syncUser();
      closeUtilityPanel();
      showToast('Profile updated.');
    } catch (error) {
      console.error('Unable to update the user profile:', error);
      showToast('Unable to update your profile. Please try again.');
    }
  }
  if (event.target.id === 'securityForm') { showToast('Security settings saved locally.'); closeUtilityPanel(); }
});
authSwitch.addEventListener('click', () => {
  authMode = authMode === 'login' ? 'signup' : 'login';
  document.getElementById('authTitle').textContent = authMode === 'login' ? 'Welcome back' : 'Create your Vyqenox Axis account';
  document.getElementById('authSubtitle').textContent = authMode === 'login' ? 'Sign in to your Vyqenox Axis workspace.' : 'Set up your account and school workspace.';
  document.querySelector('.auth-confirm').hidden = authMode === 'login';
  document.querySelector('.auth-name').hidden = authMode === 'login';
  nameInput.required = authMode === 'signup';
  schoolInput.required = authMode === 'signup';
  authSubmit.textContent = authMode === 'login' ? 'Log in' : 'Create account';
  authSwitch.innerHTML = authMode === 'login' ? 'New to Axis? <b>Create an account</b>' : 'Already have an account? <b>Log in</b>';
});
authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(authForm));
  const email = data.email.trim().toLowerCase();
  if (authMode === 'signup') {
    const displayName = data.name.trim();
    const schoolName = data.school.trim();
    let newFirebaseUser = null;
    let onboardingCommitted = false;
    accountSetupInProgress = true;
    authSubmit.disabled = true;
    authSwitch.disabled = true;
    try {
      const credential = await createUserWithEmailAndPassword(auth, email, data.password);
      newFirebaseUser = credential.user;
      await updateProfile(newFirebaseUser, { displayName });
      await createSchoolWorkspace(newFirebaseUser, displayName, schoolName);
      onboardingCommitted = true;
      const workspaceUser = await loadUserWorkspace(newFirebaseUser);
      currentUser = workspaceUser;
      localStorage.setItem('pivot-user', JSON.stringify(workspaceUser));
      showApp();
      showToast('Account and school workspace created.');
    } catch (error) {
      console.error('Unable to create the Axis account and school workspace:', error);
      if (newFirebaseUser && !onboardingCommitted) {
        try {
          await deleteUser(newFirebaseUser);
        } catch (cleanupError) {
          console.error('Unable to remove the incomplete Firebase account:', cleanupError);
          try {
            await signOut(auth);
          } catch (signOutError) {
            console.error('Unable to sign out after incomplete account setup:', signOutError);
          }
        }
      } else if (newFirebaseUser && auth.currentUser?.uid === newFirebaseUser.uid) {
        await signOut(auth).catch((signOutError) => console.error('Unable to sign out after setup failed:', signOutError));
      }
      currentUser = null;
      localStorage.removeItem('pivot-user');
      showAuth();
      showToast(getAuthErrorMessage(error, 'signup'));
    } finally {
      accountSetupInProgress = false;
      authSubmit.disabled = false;
      authSwitch.disabled = false;
    }
    return;
  }
  authSubmit.disabled = true;
  authSwitch.disabled = true;
  try {
    await signInWithEmailAndPassword(auth, email, data.password);
  } catch (error) {
    console.error('Unable to sign in to Vyqenox Axis:', error);
    showToast(getAuthErrorMessage(error));
  } finally {
    authSubmit.disabled = false;
    authSwitch.disabled = false;
  }
});
recordForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const records = JSON.parse(localStorage.getItem('vyqenox-pivot-records') || '[]');
  records.push(Object.fromEntries(new FormData(recordForm)));
  localStorage.setItem('vyqenox-pivot-records', JSON.stringify(records));
  closeRecordModal();
  showToast('Record saved locally. It will sync when an API is connected.');
});
bindOverviewEvents();
sanitizeOperationalCopy();
clearDemoWorkspace();
