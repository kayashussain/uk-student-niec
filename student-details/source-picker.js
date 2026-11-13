// "Where did the student come from?": one component for Add student, Add many students and the student card, so every form asks the
// same way. The first dropdown is the source (Branch, Agent, Events, Social Media, Language Classes, Reference, Visitor); the second shows
// what belongs to it: the branches, the agents, the events that were held, the platforms, the classes, the kinds of reference. For
// Social Media and Reference there is also a remarks box (what the student saw, or who referred the student); a paid campaign is never typed
// there: it is chosen, so it is counted in its cost.
// window.SourcePicker.create({ lists, initial: { source, detail, remarks } }) returns { nodes, value(), check() }, where value() is
// { source (what the sheet keeps, "Chitwan Branch" for a branch), detail, remarks }, and check() is '' when the choice is complete or
// the reason it is not. No student from an event or a campaign may slip out of its cost per student: "Events" needs the event, and
// "Social Media", while a campaign is running (or ended in the last 45 days, lists.recentCampaigns), needs the answer to "Did this
// student come from a campaign?" (one of them, or "No, not from a campaign"). Every form calls check() before it saves.
(function (root) {
  const { el, h, api, field, dialog } = root.Portal;
  const F = root.CardFields;
  const WITH_REMARKS = { 'Social Media': 'Remarks (optional)', Reference: 'Who referred the student (name) or remarks' };
  const REMARK_HELP = { 'Social Media': 'For example: the post or video they saw. A paid campaign is chosen above, not typed here.', Reference: 'For example: the name of the student or person who referred.' };

  function create({ lists, initial = {}, onChange = () => {}, disabled = false }) {
    const groups = Object.keys(F.SOURCE_DETAILS);
    const options = (g) => (g === 'Agent' ? lists.partners : (lists.sourceOptions[g] || F.SOURCE_DETAILS[g] || []));
    const startGroup = F.sourceGroup(initial.source) || '';
    const source = field('Where did the student come from?', { kind: 'select', choices: groups, value: groups.includes(startGroup) ? startGroup : '', disabled });
    const detailBox = el('div', 'p-field');
    const remarkBox = el('div', 'p-field');
    const askBox = el('div', 'p-field sp-ask');
    let detailInput = null;
    let answer = ''; // the campaign the student came from, 'none', or '' (not answered yet)
    const recent = (lists.recentCampaigns || []);
    let remarksInput = null;
    let firstDraw = true;

    const drawDetail = () => {
      const g = source.input.value;
      const wrap = el('div');
      if (!g) { detailBox.replaceChildren(); detailInput = null; remarkBox.replaceChildren(); remarksInput = null; askBox.replaceChildren(); return; }
      const label = g === 'Events' ? 'Which event or marketing that was run' : (lists.sourceLabels && lists.sourceLabels[g]) || F.SOURCE_DETAIL_LABEL[g] || 'Which one';
      const choices = options(g);
      // What the form already holds is kept the first time round (a branch is held as "Chitwan Branch", the rest as the detail).
      const start = firstDraw ? (g === 'Branch' ? F.branchName(initial.source) : initial.detail) : '';
      const f = field(label, { kind: 'select', choices, value: start || '' });
      detailInput = f.input;
      wrap.append(f.wrap);
      if ((lists.sourceCanAdd || F.SOURCE_CAN_ADD).includes(g)) {
        const add = h('button', { class: 'p-link p-small', type: 'button', style: 'margin-top:4px' }, g === 'Events' ? '+ Add an event that was held' : '+ Add a missing choice');
        add.addEventListener('click', () => addChoice(g));
        wrap.append(add);
      }
      detailBox.replaceChildren(...wrap.childNodes);
      drawAsk(g, firstDraw);
      detailInput.addEventListener('change', () => { if (g === 'Social Media' && recent.length) { answer = recent.includes(detailInput.value) ? detailInput.value : (answer && answer !== 'none' ? '' : answer); paintAsk(); } });
      if (WITH_REMARKS[g]) {
        const r = field(WITH_REMARKS[g], { max: 160, placeholder: REMARK_HELP[g], value: firstDraw ? initial.remarks || '' : '' });
        remarksInput = r.input;
        remarkBox.replaceChildren(...r.wrap.childNodes);
      } else { remarkBox.replaceChildren(); remarksInput = null; }
      firstDraw = false;
      onChange();
    };

    // "Did this student come from a campaign?": shown with Social Media while a campaign is running or just ended.
    let askButtons = [];
    function drawAsk(g, first) {
      askBox.replaceChildren(); askButtons = [];
      if (g !== 'Social Media' || !recent.length || disabled) { answer = ''; return; }
      const start = first ? String(initial.detail || '') : (detailInput ? detailInput.value : '');
      // A student already saved under a platform has, in effect, answered "No"; a new one must answer.
      answer = recent.includes(start) ? start : (first && start ? 'none' : '');
      const row = el('div', 'sp-ask-choices');
      const pick = (value) => { answer = value; if (detailInput) { if (value !== 'none') detailInput.value = value; else if (recent.includes(detailInput.value)) detailInput.value = ''; } paintAsk(); };
      [...recent.map((c) => [c, c]), ['none', 'No, not from a campaign']].forEach(([value, text]) => {
        const b = h('button', { type: 'button', class: 'sp-ask-btn' }, text);
        b.dataset.value = value;
        b.addEventListener('click', () => pick(value));
        askButtons.push(b); row.append(b);
      });
      askBox.append(el('span', 'sp-ask-label', 'Did this student come from a campaign? (required)'), row);
      paintAsk();
    }
    function paintAsk() { askButtons.forEach((b) => { const on = b.dataset.value === answer; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }); }

    // A missing platform, class, kind of visit or event (with its day): saved once and offered to everyone.
    const addChoice = (g) => dialog(g === 'Events' ? 'Add an event that was held' : 'Add a choice', (b2, close2) => {
      const name = field(g === 'Events' ? 'Name of the event or marketing' : 'The new choice', { max: 100, placeholder: g === 'Events' ? 'UK Study Abroad' : 'Snapchat' });
      const date = field('Day it started', { kind: 'date' });
      const msg = el('div', 'p-msg');
      const foot = el('div', 'p-dialog-foot');
      foot.append(h('button', { class: 'btn', type: 'button', onclick: () => close2() }, 'Cancel'));
      const ok = h('button', { class: 'btn btn-primary', type: 'button' }, 'Add');
      ok.addEventListener('click', async () => {
        try { const r = await api('/api/source-options', { source: g, name: name.input.value, date: date.input.value }); lists.sourceOptions = r.options; close2(r.value); } catch (e) { msg.textContent = e.message; msg.className = 'p-msg error'; }
      });
      foot.append(ok);
      const f = el('div', 'p-form p-form-2'); f.append(name.wrap); if (g === 'Events') f.append(date.wrap);
      b2.append(f, msg, foot);
    }).then((value) => { const keep = detailInput ? detailInput.value : ''; const was = firstDraw; drawDetail(); if (detailInput) detailInput.value = value || keep; firstDraw = was; });

    source.input.addEventListener('change', drawDetail);
    drawDetail();
    return {
      nodes: [source.wrap, askBox, detailBox, remarkBox],
      source,
      // '' when complete; otherwise what is missing (shown to the person, and the form is not saved).
      check() {
        const g = source.input.value;
        const detail = detailInput ? detailInput.value : '';
        if (disabled || !g) return '';
        if (g === 'Events' && !detail) return 'Please choose which event or marketing the student came from, so it is counted in its cost.';
        if (g === 'Social Media' && recent.length && !answer) return 'Please answer "Did this student come from a campaign?", so no campaign student is missed in its cost.';
        if (g === 'Social Media' && answer === 'none' && !detail) return 'Please choose the platform the student came from.';
        return '';
      },
      // What to save: the Student Source as the sheet keeps it, what exactly, and the remarks.
      value() {
        const g = source.input.value;
        const detail = detailInput ? detailInput.value : '';
        return { source: F.storedSource(g, detail), group: g, detail: g === 'Branch' ? '' : detail, remarks: remarksInput ? remarksInput.value.trim() : '', branch: g === 'Branch' ? detail : '' };
      },
    };
  }
  root.SourcePicker = { create };
})(this);
