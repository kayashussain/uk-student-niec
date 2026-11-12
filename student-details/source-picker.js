// "Where did the student come from?": one component for Add student, Add many students and the student card, so every form asks the
// same way. The first dropdown is the source (Branch, Agent, Events, Social Media, Language Classes, Reference, Visitor); the second shows
// what belongs to it: the branches, the agents, the events that were held, the platforms, the classes, the kinds of reference. For
// Social Media and Reference there is also a remarks box (the name of the campaign, or who referred the student).
// window.SourcePicker.create({ lists, initial: { source, detail, remarks } }) returns { nodes, value() }, where value() is
// { source (what the sheet keeps, "Chitwan Branch" for a branch), detail, remarks }.
(function (root) {
  const { el, h, api, field, dialog } = root.Portal;
  const F = root.CardFields;
  const WITH_REMARKS = { 'Social Media': 'Campaign name or remarks', Reference: 'Who referred the student (name) or remarks' };
  const REMARK_HELP = { 'Social Media': 'For example: Nepal Bandha awareness campaign, or the page it ran on.', Reference: 'For example: the name of the student or person who referred.' };

  function create({ lists, initial = {}, onChange = () => {}, disabled = false }) {
    const groups = Object.keys(F.SOURCE_DETAILS);
    const options = (g) => (g === 'Agent' ? lists.partners : (lists.sourceOptions[g] || F.SOURCE_DETAILS[g] || []));
    const startGroup = F.sourceGroup(initial.source) || '';
    const source = field('Where did the student come from?', { kind: 'select', choices: groups, value: groups.includes(startGroup) ? startGroup : '', disabled });
    const detailBox = el('div', 'p-field');
    const remarkBox = el('div', 'p-field');
    let detailInput = null;
    let remarksInput = null;
    let firstDraw = true;

    const drawDetail = () => {
      const g = source.input.value;
      const wrap = el('div');
      if (!g) { detailBox.replaceChildren(el('span', 'p-label', 'Which one'), Object.assign(el('input'), { disabled: true })); detailInput = null; remarkBox.replaceChildren(); remarksInput = null; return; }
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
      if (WITH_REMARKS[g]) {
        const r = field(WITH_REMARKS[g], { max: 160, placeholder: REMARK_HELP[g], value: firstDraw ? initial.remarks || '' : '' });
        remarksInput = r.input;
        remarkBox.replaceChildren(...r.wrap.childNodes);
      } else { remarkBox.replaceChildren(); remarksInput = null; }
      firstDraw = false;
      onChange();
    };

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
      nodes: [source.wrap, detailBox, remarkBox],
      source,
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
