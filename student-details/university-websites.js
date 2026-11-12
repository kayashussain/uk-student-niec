// The official website of each university of the Fact File, used when the Fact File itself has no address written. Only the university's
// own address is listed: the course finder and the weekly check look at these addresses and nowhere else. A university with no entry here
// (the pathway and international colleges, which run on a partner's site) is simply not searched until its website is written in the Fact
// File. Each value is the list of hosts that belong to the university.

const BY_NAME = {
  'University of West London': ['uwl.ac.uk'], 'Bangor University': ['bangor.ac.uk'], 'University of Roehampton': ['roehampton.ac.uk'],
  'University of East London': ['uel.ac.uk'], 'University of York': ['york.ac.uk'], 'York St John University': ['yorksj.ac.uk'],
  'University of Worcester': ['worcester.ac.uk'], 'Leeds Trinity University': ['leedstrinity.ac.uk'], 'University College Birmingham': ['ucb.ac.uk'],
  'University of Hertfordshire': ['herts.ac.uk'], 'University of Bedfordshire': ['beds.ac.uk'], 'University of Wales Trinity Saint David': ['uwtsd.ac.uk'],
  'University of Law': ['law.ac.uk'], 'Arden University': ['arden.ac.uk'], 'University of Essex': ['essex.ac.uk'], 'University of West of Scotland': ['uws.ac.uk'],
  'University of Lancashire': ['lancashire.ac.uk', 'uclan.ac.uk'], 'University of Ravensbourne': ['ravensbourne.ac.uk'], 'Health Science University': ['hsu.ac.uk'],
  'Winchester University': ['winchester.ac.uk'], 'University of Sunderland': ['sunderland.ac.uk'], 'University of Wolverhampton': ['wlv.ac.uk'],
  'Aston University': ['aston.ac.uk'], 'University of Hull': ['hull.ac.uk'], 'Ulster University': ['ulster.ac.uk'], 'University of Portsmouth': ['port.ac.uk'],
  'University of Salford': ['salford.ac.uk'], 'Middlesex University': ['mdx.ac.uk'], 'University of Chester': ['chester.ac.uk'], 'Bath Spa University': ['bathspa.ac.uk'],
  'Regent College London': ['rcl.ac.uk'], 'Buckinghamshire New University': ['bucks.ac.uk'], 'University of Plymouth': ['plymouth.ac.uk'],
  'University of Surrey': ['surrey.ac.uk'], 'University for the Creative Arts': ['uca.ac.uk'], 'University of Brighton': ['brighton.ac.uk'],
  'University of Staffordshire': ['staffs.ac.uk'], 'Harper Adams University': ['harper-adams.ac.uk'], 'Edinburgh Napier University': ['napier.ac.uk'],
  'Birmingham City University': ['bcu.ac.uk'], 'Cardiff Metropolitan University': ['cardiffmet.ac.uk'], 'University of Bradford': ['bradford.ac.uk'],
  'International College of Dundee (ICD)-Scotland': ['dundee.ac.uk'], 'Northumbria University': ['northumbria.ac.uk'], 'Lincoln Bishop University': ['lincolnbishop.ac.uk'],
  'Sheffield Hallam University': ['shu.ac.uk'],
};

// The hosts of a university: from its website in the Fact File, or from the list above.
function hostsOf(university) {
  const hosts = [];
  const site = String((university && university.website) || '').trim();
  const m = /^https?:\/\/([^/\s]+)/i.exec(site);
  if (m) hosts.push(m[1].toLowerCase().replace(/^www\./, ''));
  (BY_NAME[university && university.name] || []).forEach((h) => { if (!hosts.includes(h)) hosts.push(h); });
  return hosts;
}
const websiteOf = (university) => { const h = hostsOf(university)[0]; return h ? `https://www.${h}` : ''; };
// Is the web address on one of the hosts (or a sub-domain of one)?
const onHosts = (url, hosts) => { try { const h = new URL(url).hostname.toLowerCase(); return hosts.some((x) => h === x || h.endsWith('.' + x)); } catch (e) { return false; } };

module.exports = { hostsOf, websiteOf, onHosts, BY_NAME };
