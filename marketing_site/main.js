(() => {
  const year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
  document.querySelectorAll('[data-date="today"]').forEach((el) => {
    try {
      el.textContent = new Date().toLocaleDateString('en-IN', { dateStyle: 'medium' });
    } catch (_) {
      el.textContent = new Date().toISOString().slice(0, 10);
    }
  });

  const btn = document.getElementById('menuBtn');
  const nav = document.getElementById('mobileNav');
  if (btn && nav) {
    const toggle = () => {
      const open = nav.classList.toggle('open');
      nav.setAttribute('aria-hidden', open ? 'false' : 'true');
      btn.textContent = open ? 'Close' : 'Menu';
    };
    btn.addEventListener('click', toggle);
    nav.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => {
      if (nav.classList.contains('open')) toggle();
    }));
  }

  const form = document.getElementById('flContactForm');
  const preview = document.getElementById('flIntakePreview');
  const copyBtn = document.getElementById('flCopyIntakeBtn');

  const SALES_EMAIL = 'fancybeardarmies@gmail.com';

  const safe = (v) => String(v || '').trim();
  const pick = (fd, k) => safe(fd.get(k));

  const buildIntakeText = (fd) => {
    const lines = [];
    lines.push('FraudLens — Company Intake');
    lines.push(`Date: ${new Date().toISOString()}`);
    lines.push('');
    lines.push('Company');
    lines.push(`- Name: ${pick(fd, 'companyName')}`);
    lines.push(`- Website: ${pick(fd, 'companyWebsite') || '—'}`);
    lines.push('');
    lines.push('Contact');
    lines.push(`- Name: ${pick(fd, 'contactName')}`);
    lines.push(`- Email: ${pick(fd, 'email')}`);
    lines.push(`- Phone: ${pick(fd, 'phone') || '—'}`);
    lines.push(`- Role/team: ${pick(fd, 'role') || '—'}`);
    lines.push('');
    lines.push('Requirements');
    lines.push(`- Use case: ${pick(fd, 'useCase')}`);
    lines.push(`- Deployment: ${pick(fd, 'deployment') || '—'}`);
    lines.push(`- Data residency: ${pick(fd, 'residency') || '—'}`);
    lines.push(`- Volume: ${pick(fd, 'volume') || '—'}`);
    lines.push(`- Timeline: ${pick(fd, 'timeline') || '—'}`);
    lines.push('');
    lines.push('Integrations / constraints');
    lines.push(pick(fd, 'integrations') || '—');
    lines.push('');
    lines.push('Notes');
    lines.push(pick(fd, 'notes') || '—');
    return lines.join('\n');
  };

  const renderPreview = (text) => {
    if (!preview) return;
    preview.textContent = text || 'Fill the form to generate an intake summary.';
  };

  const updatePreviewFromForm = () => {
    if (!form) return;
    const fd = new FormData(form);
    const company = pick(fd, 'companyName');
    const contact = pick(fd, 'contactName');
    const email = pick(fd, 'email');
    const useCase = pick(fd, 'useCase');
    if (!company && !contact && !email && !useCase) {
      renderPreview('');
      if (copyBtn) copyBtn.disabled = true;
      return;
    }
    const text = buildIntakeText(fd);
    renderPreview(text);
    if (copyBtn) copyBtn.disabled = !text.trim();
  };

  if (form) {
    form.addEventListener('input', updatePreviewFromForm);
    updatePreviewFromForm();

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const companyName = pick(fd, 'companyName');
      const contactName = pick(fd, 'contactName');
      const email = pick(fd, 'email');
      const useCase = pick(fd, 'useCase');

      if (!companyName || !contactName || !email || !useCase) {
        alert('Please fill Company name, Contact name, Work email, and Primary use case.');
        return;
      }

      const intakeText = buildIntakeText(fd);
      renderPreview(intakeText);
      if (copyBtn) copyBtn.disabled = false;

      const subject = `FraudLens — Sales inquiry — ${companyName}`;
      const body = intakeText;
      const mailto = `mailto:${encodeURIComponent(SALES_EMAIL)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

      // Open user's email client with prefilled subject/body (static-host friendly).
      window.location.href = mailto;
    });
  }

  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try {
        const text = preview ? preview.textContent : '';
        if (!text || !text.trim()) return;
        await navigator.clipboard.writeText(text);
        copyBtn.textContent = 'Copied';
        setTimeout(() => {
          copyBtn.textContent = 'Copy intake';
        }, 1200);
      } catch (err) {
        console.error(err);
        alert('Copy failed. Please select the preview text and copy manually.');
      }
    });
  }
})();

