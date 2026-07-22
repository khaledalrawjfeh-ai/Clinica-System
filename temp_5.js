
(function setMaxDates() {
  const today = new Date().toISOString().split('T')[0];
  ['pDob', 'npDob', 'epDob'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.max = today;
  });
})();
