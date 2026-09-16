import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const artifactModules = process.env.ARTIFACT_NODE_MODULES;
if (!artifactModules || !path.isAbsolute(artifactModules)) {
  throw new Error("Set ARTIFACT_NODE_MODULES to the bundled node_modules directory");
}
const { Presentation, PresentationFile } = await import(
  pathToFileURL(path.join(artifactModules, "@oai/artifact-tool/dist/artifact_tool.mjs")).href,
);

const repo = path.resolve(import.meta.dirname, "../..");
const outDir = path.join(repo, ".codex-build/pitch-v2");
await fs.mkdir(outDir, { recursive: true });

const W = 1440;
const H = 810;
const C = {
  ink: "#123F49",
  green: "#087F8C",
  mint: "#E1F4F1",
  paper: "#FFFAF2",
  lavender: "#EDE8FB",
  muted: "#536870",
  line: "#B8D6D5",
  peach: "#FFD1AF",
  white: "#FFFFFF",
  darkGreen: "#173F31",
  gold: "#E5C982",
};
const FONT = "Avenir Next";
const SERIF = "Georgia";

const deck = Presentation.create({ slideSize: { width: W, height: H } });
const slides = [];

function shape(slide, geometry, left, top, width, height, fill = "none", lineFill = "none", radius = 0) {
  return slide.shapes.add({
    geometry,
    position: { left, top, width, height },
    fill,
    line: { fill: lineFill, width: lineFill === "none" ? 0 : 1 },
    ...(radius ? { borderRadius: radius } : {}),
  });
}

function text(slide, value, left, top, width, height, opts = {}) {
  const box = shape(slide, "textbox", left, top, width, height, opts.fill ?? "none", opts.line ?? "none", opts.radius ?? 0);
  box.text = value;
  box.text.style = {
    typeface: opts.typeface ?? FONT,
    fontSize: opts.size ?? 24,
    bold: opts.bold ?? false,
    italic: opts.italic ?? false,
    color: opts.color ?? C.ink,
    autoFit: opts.autoFit ?? "shrinkText",
  };
  box.text.alignment = opts.align ?? "left";
  box.text.verticalAlignment = opts.valign ?? "top";
  return box;
}

function rule(slide, left, top, width, color = C.line, height = 2) {
  return shape(slide, "rect", left, top, width, height, color, "none");
}

function base(section, index, background = C.paper) {
  const slide = deck.slides.add();
  slide.background.fill = background;
  shape(slide, "rect", 0, 0, 12, H, C.green, "none");
  text(slide, "+", 64, 38, 31, 31, { size: 21, bold: true, align: "center", valign: "middle", line: C.ink, radius: 16 });
  text(slide, "Carestead", 104, 39, 190, 35, { size: 23, bold: true });
  text(slide, section.toUpperCase(), 950, 44, 425, 28, { size: 13, bold: true, color: C.green, align: "right" });
  const footerColor = background === C.ink ? C.mint : C.muted;
  text(slide, "Carestead · GenAI Academy · September 2026 · v2", 64, 770, 650, 18, { size: 12, color: footerColor });
  text(slide, `${String(index).padStart(2, "0")} / 16`, 1275, 770, 100, 18, { size: 12, color: footerColor, align: "right" });
  slides.push(slide);
  return slide;
}

function title(slide, kicker, heading, lede = "") {
  text(slide, kicker.toUpperCase(), 64, 105, 600, 24, { size: 13, bold: true, color: C.green });
  text(slide, heading, 64, 142, 1240, 120, { size: 48, bold: true });
  if (lede) text(slide, lede, 64, 265, 1210, 58, { size: 21, color: C.muted });
}

function card(slide, x, y, w, h, heading, body, opts = {}) {
  shape(slide, "roundRect", x, y, w, h, opts.fill ?? C.white, opts.line ?? C.line, 14);
  if (opts.number) {
    shape(slide, "ellipse", x + 20, y + 18, 36, 36, opts.numberFill ?? C.green, "none");
    text(slide, String(opts.number), x + 20, y + 20, 36, 28, { size: 17, bold: true, color: C.white, align: "center", valign: "middle" });
  }
  const tx = x + (opts.number ? 70 : 22);
  text(slide, heading, tx, y + 18, w - (tx - x) - 18, 34, { size: opts.headingSize ?? 22, bold: true, color: opts.headingColor ?? C.ink });
  text(slide, body, tx, y + 58, w - (tx - x) - 18, h - 70, { size: opts.bodySize ?? 16, color: opts.bodyColor ?? C.muted });
}

async function image(slide, rel, x, y, w, h, alt, fit = "contain", radius = 12) {
  const abs = path.join(repo, rel);
  const blob = new Uint8Array(await fs.readFile(abs));
  const ext = path.extname(abs).toLowerCase();
  const contentType = ext === ".svg" ? "image/svg+xml" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
  return slide.images.add({ blob, contentType, alt, fit, position: { left: x, top: y, width: w, height: h }, geometry: radius ? "roundRect" : "rect", ...(radius ? { borderRadius: radius } : {}) });
}

function note(slide, value) {
  slide.speakerNotes.textFrame.setText(value);
}

// 1. Cover
{
  const slide = base("Gen AI Academy · Team Project", 1, C.mint);
  text(slide, "THE CAREGIVER COGNITIVE-LOAD AGENT", 64, 140, 760, 28, { size: 14, bold: true, color: C.green });
  text(slide, "Less to carry.\nMore care to give.", 64, 190, 1100, 190, { size: 76, bold: true });
  text(slide, "A shared care picture. A clear next step.\nAn agent that helps while the caregiver stays in control.", 64, 410, 880, 92, { size: 28, color: C.muted });
  rule(slide, 64, 560, 1200);
  text(slide, "Care Plan", 64, 586, 190, 36, { size: 22 });
  text(slide, "Care Circle", 286, 586, 190, 36, { size: 22 });
  text(slide, "Care Organizer", 510, 586, 220, 36, { size: 22 });
  text(slide, "Care Handover", 765, 586, 220, 36, { size: 22 });
  text(slide, "Grounded Agent", 1020, 586, 245, 36, { size: 22 });
  text(slide, "Frincy Clement · Maneetta Antony · Tejaswini Venkata Raju · Shrijan Chipalu", 64, 680, 1100, 28, { size: 16, color: C.muted });
  note(slide, "SPEAKER 1 | Caregiving means managing more than tasks. One person often carries the changing checklist across appointments and people. Carestead reduces that load.");
}

// 2. Persona
{
  const slide = base("The problem · Meet Maya", 2, C.mint);
  text(slide, "ONE CAREGIVER. TOO MUCH TO REMEMBER.", 64, 110, 600, 25, { size: 13, bold: true, color: C.green });
  text(slide, "Everyone has part of the story.\nMaya holds it all together.", 64, 150, 690, 150, { size: 53, bold: true });
  text(slide, "She coordinates Alex’s care around work and family, remembering every change and resolving schedule conflicts again and again.", 64, 325, 650, 90, { size: 22, color: C.muted });
  card(slide, 64, 455, 610, 132, "The invisible work of care", "Keep the information in her head. Spot the clash. Find cover. Update everyone.", { fill: C.white, line: C.line, headingSize: 17, bodySize: 19 });
  await image(slide, "docs/pitch-deck/assets/maya-persona.svg", 770, 115, 575, 555, "Illustrative caregiver persona surrounded by appointments, work, medication pickup, and transport needs", "contain", 0);
  text(slide, "Illustrative persona and scenario", 915, 680, 330, 24, { size: 12, color: C.muted, align: "center" });
  note(slide, "SPEAKER 1 | Meet Maya. She coordinates Alex's care while balancing work and family, connecting information held by different people.");
}

// 3. Problem
{
  const slide = base("The coordination gap", 3);
  title(slide, "The problem", "Care happens across people.\nThe mental checklist stays with one.");
  card(slide, 64, 330, 390, 270, "“I thought you were taking Alex tomorrow.”", "A change in one place can leave the ride, reminder, or caregiver assignment pointing to the old plan.", { fill: C.mint, headingSize: 29, bodySize: 19 });
  card(slide, 486, 330, 390, 270, "Every handover costs attention", "The next caregiver needs current state, open risks, reliable contacts, and the exact items requiring review.", { fill: C.lavender, bodySize: 19 });
  card(slide, 908, 330, 390, 270, "More reminders are not enough", "The practical need is shared context, a named owner, a safe decision, and a visible outcome.", { fill: C.peach, bodySize: 19 });
  shape(slide, "roundRect", 200, 635, 980, 64, C.green, "none", 12);
  text(slide, "Enable Maya to coordinate the next step without rebuilding the whole picture.", 230, 650, 920, 36, { size: 23, bold: true, color: C.white, align: "center" });
  note(slide, "SPEAKER 1 | When one detail changes, calendars, transport, and responsibilities can remain outdated. Reminders alone cannot close that coordination gap.");
}

// 4. Product pillars and current application
{
  const slide = base("Meet Carestead", 4);
  title(slide, "Meet Carestead", "You care. We plan.", "One place for the plan, people, evidence, and next safe step.");
  const items = [
    ["Care Plan", "Reusable templates plus person-specific preferences, routines, goals, and supports."],
    ["Care Circle", "Roles, contacts, invitations, responsibility owners, and trusted support."],
    ["Care Organizer", "Plan breaks, activities, coverage, transport, and dependencies in one flow."],
    ["Care Handover", "A concise live brief: current state, changes, risks, contacts, and watch items."],
  ];
  items.forEach((it, i) => {
    const y = 315 + i * 101;
    shape(slide, "roundRect", 64, y, 475, 91, i % 2 ? C.white : C.mint, C.line, 14);
    text(slide, it[0], 92, y + 15, 415, 28, { size: 19, bold: true });
    text(slide, it[1], 92, y + 47, 415, 32, { size: 13, color: C.muted });
  });
  shape(slide, "roundRect", 580, 310, 785, 425, C.white, C.line, 12);
  await image(slide, "docs/pitch-deck/assets/current/handover.png", 598, 326, 749, 380, "Current Carestead handover view with profile, latest state, risks, contacts, and review items", "contain", 8);
  text(slide, "Current product view: recipient profile, latest care state, review items, and handover context", 625, 707, 695, 20, { size: 12, color: C.muted, align: "center" });
  note(slide, "SPEAKER 1 | Carestead creates one shared workspace with a reusable Care Plan, trusted Care Circle, Care Organizer, and live Care Handover.");
}

// 5. Complete product feature map
{
  const slide = base("Core product features", 5, C.mint);
  title(slide, "Product map", "The complete Carestead workspace.", "A person-centered care model connects context, coordination, people, actions, and governance.");
  const groups = [
    ["Understand the person", ["Overview + profile", "Care Plan + templates", "Preferences + routines", "Memory + current risks"], C.white],
    ["Coordinate care", ["Responsibilities", "Care Organizer", "Calendar scheduling", "Timeline + activity log"], "#F4FBFA"],
    ["People + handover", ["Care Circle + roles", "Contacts + support systems", "Live Handover", "Notifications"], C.white],
    ["Agent + governance", ["Grounded chat + voice", "Document + image intake", "Integrations", "Consent + privacy + evals"], "#FFF0E4"],
  ];
  groups.forEach((g, i) => {
    const x = 48 + i * 340;
    shape(slide, "roundRect", x, 330, 312, 340, g[2], C.line, 16);
    shape(slide, "roundRect", x, 330, 312, 64, i === 3 ? "#B65A3F" : C.darkGreen, "none", 16);
    text(slide, g[0], x + 18, 347, 276, 34, { size: 20, bold: true, color: C.white, align: "center" });
    g[1].forEach((feature, j) => {
      const y = 420 + j * 57;
      shape(slide, "ellipse", x + 22, y + 3, 26, 26, j === 0 ? C.green : "#DCE9DF", "none");
      text(slide, j === 0 ? "+" : "✓", x + 22, y + 3, 26, 22, { size: 13, bold: true, color: j === 0 ? C.white : C.darkGreen, align: "center", valign: "middle" });
      text(slide, feature, x + 58, y, 226, 34, { size: 17, bold: true, color: C.ink, valign: "middle" });
      if (j < 3) rule(slide, x + 22, y + 39, 265, "#D9E5E0", 1);
    });
  });
  shape(slide, "roundRect", 215, 690, 1010, 46, C.green, "none", 12);
  text(slide, "Foundation: sign-in and roles · recipient scope · export and deletion · approval history · audit trail", 235, 701, 970, 28, { size: 15, bold: true, color: C.white, align: "center" });
  note(slide, "SPEAKER 1 | Around one care recipient, caregivers manage routines, responsibilities, appointments, contacts, notifications, activity history, chat, voice, documents, and approvals.");
}

// 6. End-to-end caregiver journey
{
  const slide = base("Prototype journey", 6);
  await image(slide, "docs/images/carestead-user-journey.png", 30, 82, 1380, 680, "Caregiver journey from sign-in and review through grounded chat, approval, action, and handover", "contain", 0);
  note(slide, "SPEAKER 1 | The journey moves from understanding the person to identifying needs, coordinating support, approving a safe action, and recording the outcome.");
}

// 7. Agent capability taxonomy
{
  const slide = base("Agent capability types", 9);
  title(slide, "Agentic design", "Not every workflow uses AI the same way.", "Carestead applies model intelligence selectively and keeps safety-critical control in deterministic code.");
  const types = [
    ["LLM-assisted workflow", "Model", "Extracts, summarizes, ranks, or drafts.", "Control layer", "Validates, clarifies, scopes, and saves after review.", C.mint],
    ["Full agentic workflow", "Model", "Interprets the goal and explains options.", "Control layer", "Retrieves, plans, calls tools, requests approval, and verifies.", C.peach],
    ["Grounded read-only", "Model", "Produces an evidence-backed answer or summary.", "Control layer", "Retrieves recipient-scoped records and checks citations.", C.white],
    ["Deterministic agent", "Model", "Optional explanation only.", "Control layer", "Rules detect risks, enforce policy, select tools, and trace outcomes.", "#EEF3EF"],
  ];
  types.forEach((t, i) => {
    const x = 64 + (i % 2) * 655;
    const y = 330 + Math.floor(i / 2) * 185;
    shape(slide, "roundRect", x, y, 615, 160, t[5], C.line, 14);
    text(slide, t[0], x + 22, y + 18, 565, 34, { size: 23, bold: true });
    text(slide, t[1].toUpperCase(), x + 22, y + 65, 110, 22, { size: 12, bold: true, color: C.green });
    text(slide, t[2], x + 130, y + 62, 455, 30, { size: 16, color: C.ink });
    text(slide, t[3].toUpperCase(), x + 22, y + 105, 110, 22, { size: 12, bold: true, color: C.green });
    text(slide, t[4], x + 130, y + 101, 455, 42, { size: 16, color: C.muted });
  });
  shape(slide, "roundRect", 230, 706, 980, 34, C.darkGreen, "none", 12);
  text(slide, "Interaction modes: text · voice transcript · spoken reply · image · PDF · structured records", 250, 712, 940, 24, { size: 15, bold: true, color: C.white, align: "center" });
  note(slide, "SPEAKER 2 | Carestead uses several capability patterns. The LLM handles language, extraction, and summarization. Agentic workflows add retrieval, decisions, tools, approval, and verification.");
}

// 8. Workflow mapping
{
  const slide = base("Agent workflows in the product", 10, C.mint);
  text(slide, "CAPABILITY MAP", 64, 103, 600, 28, { size: 16, bold: true, color: C.darkGreen });
  text(slide, "Eight workflows. Four capability patterns.", 64, 142, 1240, 120, { size: 48, bold: true });
  text(slide, "Each workflow states what the model contributes and what the agent controls.", 64, 265, 1210, 58, { size: 21, color: C.muted });
  const workflows = [
    ["Grounded care chat", "HYBRID AGENTIC", "LLM: understand and synthesize", "Agent: retrieve, cite, route, approve, execute"],
    ["Conflict resolution", "FULL AGENTIC", "LLM: rank and explain", "Agent: simulate, validate, reschedule, verify"],
    ["Care-update extraction", "LLM ASSISTED", "LLM: extract intent and details", "Agent: clarify, validate, match, approve, save"],
    ["Intelligent handover", "GROUNDED READ ONLY", "LLM: evidence-backed summary", "Agent: scoped retrieval and citation checks"],
    ["Adaptive care-plan builder", "LLM PLANNING", "LLM: propose plan and missing details", "Agent: isolate, validate, approve, create tasks"],
    ["Communication composer", "LLM + DELIVERY", "LLM: draft and adapt tone", "Agent: audience, channel, approval, receipt"],
    ["Document and image intake", "MULTIMODAL LLM", "LLM: extract fields and uncertainty", "Agent: consent, validate, approve, track"],
    ["Risk checks and memory", "DETERMINISTIC AGENT", "LLM: optional explanation", "Agent: rules, retrieval, policy, traces"],
  ];
  workflows.forEach((w, i) => {
    const col = i < 4 ? 0 : 1;
    const row = i % 4;
    const x = 55 + col * 675;
    const y = 320 + row * 103;
    shape(slide, "roundRect", x, y, 645, 88, row % 2 ? C.white : "#F7FCFA", C.line, 12);
    text(slide, w[0], x + 18, y + 13, 340, 28, { size: 19, bold: true });
    shape(slide, "roundRect", x + 365, y + 8, 258, 35, "#FFD6BA", "#E9A777", 16);
    text(slide, w[1], x + 375, y + 14, 238, 23, { size: 15, bold: true, color: C.darkGreen, align: "center", valign: "middle" });
    text(slide, w[2], x + 18, y + 48, 285, 22, { size: 13, color: C.ink });
    text(slide, w[3], x + 315, y + 46, 310, 30, { size: 13, color: C.muted });
  });
  note(slide, "SPEAKER 2 | Across eight workflows, each card separates the model contribution from the controls enforced by the agent and orchestrator.");
}

// 9. Grounded chat and reviewed action
{
  const slide = base("Grounded chat · Reviewable actions", 7);
  title(slide, "Prototype usability", "Ask naturally. See the evidence.\nApprove the exact next step.");
  const rows = [
    ["Grounded answer", "The LLM answers from the selected person’s current records and returns evidence IDs."],
    ["Action proposal", "The orchestrator converts the request into a scoped, validated preview. It does not write immediately."],
    ["Approval + outcome", "An authorized caregiver approves. Carestead executes once and records the result."],
  ];
  rows.forEach((r, i) => card(slide, 64, 335 + i * 122, 655, 104, r[0], r[1], { fill: i === 1 ? C.peach : C.white, headingSize: 21, bodySize: 17, number: i + 1 }));
  await image(slide, "docs/pitch-deck/assets/current/chat-approval.png", 790, 275, 465, 470, "Carestead chat showing a pending approval for an appointment change", "contain", 12);
  note(slide, "SPEAKER 1 | A caregiver asks Carestead naturally, inspects the evidence, and requests an action. Carestead prepares the exact change for caregiver approval.");
}

// 10. Voice and multimodal intake
{
  const slide = base("Voice · Multimodal intake", 8);
  title(slide, "Voice + multimodal", "Care updates arrive in the format caregivers already have.", "Speak a request, type a note, or upload an image or PDF. Review structured changes before saving.");
  await image(slide, "docs/screenshots/voice-chat.png", 64, 330, 610, 340, "Carestead voice-enabled chat", "contain", 12);
  await image(slide, "docs/screenshots/document-image-intake.png", 735, 300, 300, 405, "Carestead document and image intake", "contain", 12);
  card(slide, 1060, 330, 280, 150, "Voice interaction", "Speech-to-text starts a grounded chat. Spoken replies are optional. Carestead stores transcript text, not raw microphone audio.", { fill: C.mint, headingSize: 20, bodySize: 15 });
  card(slide, 1060, 505, 280, 165, "Multimodal extraction", "The model extracts dates, contacts, follow-ups, facts, and uncertainty. The agent validates scope and asks for approval before saving.", { fill: C.peach, headingSize: 20, bodySize: 15 });
  note(slide, "SPEAKER 1 | Updates can arrive as speech, notes, documents, or images. The model extracts information, and the agent validates it before saving. HANDOFF: Now we will explain the agent design behind that experience.");
}

// 11. Technical architecture, unchanged
{
  const slide = base("Technical architecture", 11);
  await image(slide, "docs/images/carestead-technical-architecture.png", 30, 80, 1380, 680, "Carestead technical architecture", "contain", 0);
  note(slide, "SPEAKER 2 | Authenticated APIs connect the interface to a TypeScript orchestrator, recipient-scoped retrieval, the OpenAI Responses API, policy gates, and narrow tools.");
}

// 12. Decision path, unchanged
{
  const slide = base("Decision path", 12);
  await image(slide, "docs/images/carestead-decision-path.png", 30, 80, 1380, 680, "Carestead decision path", "contain", 0);
  note(slide, "SPEAKER 2 | Missing evidence triggers clarification. Read-only questions return grounded answers. Consequential actions require authorization, approval, verification, and an audit record.");
}

// 13. Autonomy and tools
{
  const slide = base("Bounded autonomy · Tool surface", 13);
  title(slide, "Bounded autonomy", "The system can reason broadly.\nIt can act only through narrow, reviewable tools.");
  card(slide, 64, 330, 395, 185, "LLM contributes", "Interpret intent · extract facts · summarize evidence · draft language · rank already-feasible options", { fill: "#EEF3EF", headingSize: 22, bodySize: 18 });
  card(slide, 490, 330, 395, 185, "Orchestrator decides", "Recipient scope · tool routing · role checks · consent · risk rules · feasibility · idempotency", { fill: C.mint, headingSize: 22, bodySize: 18 });
  card(slide, 916, 330, 395, 185, "Caregiver decides", "Approve, edit, or reject calendar changes, assignments, messages, plan changes, and other consequential writes", { fill: C.peach, headingSize: 22, bodySize: 18 });
  const tools = ["Profile + plan", "Responsibilities", "Calendar", "Care Circle", "Handover", "Notifications", "Memory", "Audit + evals"];
  tools.forEach((t, i) => {
    const x = 64 + (i % 4) * 320;
    const y = 560 + Math.floor(i / 4) * 62;
    shape(slide, "roundRect", x, y, 285, 44, C.white, C.line, 20);
    text(slide, t, x + 14, y + 9, 255, 28, { size: 16, bold: true, align: "center", valign: "middle" });
  });
  note(slide, "SPEAKER 2 | The LLM interprets and summarizes. Deterministic code controls recipient scope, consent, feasibility, and tool access. The caregiver makes the decision.");
}

// 14. Evaluation
{
  const slide = base("Evaluation strategy", 14);
  title(slide, "Evaluation", "Evaluate every step, not only the final answer.", "Each synthetic scenario has known evidence, policy, action, and outcome expectations.");

  const stages = [
    ["1", "Scenario", "Known input + outcome"],
    ["2", "Retrieve", "Scoped evidence"],
    ["3", "Decide", "Risk or clarification"],
    ["4", "Constrain", "Policy + approval"],
    ["5", "Act", "Allowed tool"],
    ["6", "Verify", "Recorded outcome"],
  ];
  stages.forEach((s, i) => {
    const x = 55 + i * 218;
    shape(slide, "roundRect", x, 300, 188, 62, i === 3 ? C.peach : C.mint, C.line, 12);
    shape(slide, "ellipse", x + 12, 315, 30, 30, i === 3 ? "#B65A3F" : C.green, "none");
    text(slide, s[0], x + 12, 319, 30, 20, { size: 13, bold: true, color: C.white, align: "center", valign: "middle" });
    text(slide, s[1], x + 52, 307, 120, 23, { size: 16, bold: true });
    text(slide, s[2], x + 52, 334, 120, 18, { size: 11, color: C.muted });
    if (i < stages.length - 1) text(slide, "→", x + 190, 317, 26, 28, { size: 22, bold: true, color: C.green, align: "center" });
  });

  text(slide, "EIGHT SCORED DIMENSIONS", 55, 382, 500, 24, { size: 13, bold: true, color: C.green });
  const metrics = [
    ["Retrieval recall", "Find every expected recipient-scoped record."],
    ["Retrieval precision", "Exclude irrelevant and other-recipient records."],
    ["Grounding", "Tie factual claims and decisions to evidence IDs."],
    ["Decision", "Choose the correct risk, action class, or clarification."],
    ["Policy", "Apply roles, consent, approval, and non-clinical limits."],
    ["Action + tool", "Select an allowed tool with valid scoped arguments."],
    ["Outcome", "Verify success or report tool failure honestly."],
    ["Safety", "Preserve isolation, atomicity, and prohibited-action rules."],
  ];
  metrics.forEach((m, i) => {
    const x = 55 + (i % 4) * 329;
    const y = 414 + Math.floor(i / 4) * 94;
    shape(slide, "roundRect", x, y, 300, 80, i === 7 ? C.peach : i % 2 ? "#F4F8F5" : C.white, C.line, 11);
    text(slide, m[0], x + 16, y + 12, 268, 24, { size: 17, bold: true });
    text(slide, m[1], x + 16, y + 40, 268, 29, { size: 12, color: C.muted });
  });

  shape(slide, "roundRect", 55, 620, 1290, 104, C.darkGreen, "none", 14);
  text(slide, "104", 85, 637, 125, 42, { size: 36, bold: true, color: C.white, align: "center" });
  text(slide, "synthetic scenarios\n16 risk + 88 trajectories", 80, 681, 135, 31, { size: 11, color: C.mint, align: "center" });
  rule(slide, 235, 638, 2, "#6F8E7E", 66);
  text(slide, "8 workflows · 11 conditions", 265, 644, 310, 30, { size: 20, bold: true, color: C.white, align: "center" });
  text(slide, "Text · chat · voice · image · tool failure · prompt injection", 265, 680, 310, 25, { size: 11, color: C.mint, align: "center" });
  rule(slide, 602, 638, 2, "#6F8E7E", 66);
  text(slide, "104 / 104 passed", 630, 643, 240, 32, { size: 23, bold: true, color: C.white, align: "center" });
  text(slide, "All eight dimensions = 100%", 630, 681, 240, 25, { size: 12, color: C.mint, align: "center" });
  rule(slide, 895, 638, 2, "#6F8E7E", 66);
  text(slide, "Hard gate", 925, 640, 165, 27, { size: 20, bold: true, color: C.peach, align: "center" });
  text(slide, "One policy or safety violation fails CI.", 915, 676, 185, 31, { size: 12, color: C.white, align: "center" });
  text(slide, "Synthetic regression benchmark", 1125, 643, 190, 24, { size: 16, bold: true, color: C.white, align: "center" });
  text(slide, "Not clinical validation or measured caregiver impact.", 1120, 677, 200, 33, { size: 11, color: C.mint, align: "center" });
  note(slide, "SPEAKER 2 | We score retrieval, grounding, decisions, policy, tools, outcomes, and safety across 104 synthetic scenarios. One safety violation fails the run.");
}

// 15. Mobile
{
  const slide = base("Mobile deployment track", 15, C.mint);
  title(slide, "Mobile", "The same care workspace is moving to iPhone.", "A Capacitor/iOS pilot reuses the responsive Carestead UI, shared types, and the same authenticated backend APIs.");
  shape(slide, "roundRect", 90, 320, 280, 335, C.ink, "none", 36);
  shape(slide, "roundRect", 106, 340, 248, 285, C.white, "none", 24);
  text(slide, "+ Carestead", 132, 365, 195, 35, { size: 22, bold: true, color: C.green, align: "center" });
  text(slide, "Plan\nChat + voice\nCalendar\nHandover\nApprovals", 132, 425, 195, 150, { size: 22, bold: true, color: C.ink, align: "center", valign: "middle" });
  text(slide, "iOS pilot", 135, 582, 190, 24, { size: 14, color: C.muted, align: "center" });
  text(slide, "→", 395, 438, 70, 80, { size: 54, bold: true, color: C.green, align: "center" });
  card(slide, 485, 320, 380, 150, "Shared application layer", "Web and mobile import the same dashboard, chat, calendar, account flows, styles, and API types.", { fill: C.white, headingSize: 21, bodySize: 17 });
  card(slide, 485, 500, 380, 150, "Native adapter", "Restricted HTTPS API bridge plus native speech recognition and synthesis, with native share support.", { fill: "#EEF3EF", headingSize: 21, bodySize: 17 });
  card(slide, 900, 320, 400, 150, "Already checked", "Web/mobile builds · browser integration · unsigned iOS simulator build · transport and config tests.", { fill: C.white, headingSize: 21, bodySize: 17 });
  card(slide, 900, 500, 400, 150, "Before distribution", "Signed-device sessions · native accessibility · Google OAuth return · native push · icon/store/privacy review.", { fill: C.peach, headingSize: 21, bodySize: 17 });
  text(slide, "STATUS · Integration in progress. Pilot, not an App Store release.", 500, 685, 780, 34, { size: 16, bold: true, color: C.green, align: "center" });
  note(slide, "SPEAKER 2 | The same workspace is moving to an iPhone pilot with care plans, calendar, handover, approvals, and native voice.");
}

// 16. Real-world impact and close
{
  const slide = base("Real-world impact · The promise", 16, C.ink);
  shape(slide, "rect", 0, 0, 12, H, C.peach, "none");
  text(slide, "REAL-WORLD IMPACT", 64, 118, 600, 28, { size: 14, bold: true, color: C.mint });
  text(slide, "A scattered care story becomes\na safe, shared next step.", 64, 160, 1190, 125, { size: 52, bold: true, color: C.white });
  card(slide, 64, 330, 595, 220, "Before Carestead", "Fragmented information\nRepeated reconstruction\nUnclear responsibility ownership\nFollow-up and handover gaps", { fill: C.peach, line: "none", headingSize: 25, bodySize: 19, bodyColor: C.ink });
  card(slide, 690, 330, 595, 220, "With Carestead", "Shared recipient context\nNamed ownership and reviewable actions\nVisible outcomes and audit history\nFaster, clearer caregiver handover", { fill: C.mint, line: "none", headingSize: 25, bodySize: 19, bodyColor: C.ink });
  text(slide, "PILOT MEASURES", 64, 590, 190, 24, { size: 13, bold: true, color: C.mint });
  text(slide, "Coordination time · unresolved responsibilities · unnecessary alerts · handover completeness · caregiver confidence", 250, 586, 1040, 34, { size: 18, color: C.white });
  shape(slide, "roundRect", 190, 650, 1060, 62, C.peach, "none", 12);
  text(slide, "Less to carry. More care to give.", 220, 665, 1000, 34, { size: 27, bold: true, color: C.ink, align: "center" });
  note(slide, "SPEAKER 2 | Carestead turns a scattered care story into a shared, reviewable next step. Less to carry. More care to give. Now let us demonstrate it.");
}

// Keep the product experience together before the agent and engineering section.
// moveTo uses zero-based slide positions.
slides[8].moveTo(6);
slides[9].moveTo(7);
const orderedSlides = [
  ...slides.slice(0, 6),
  slides[8],
  slides[9],
  slides[6],
  slides[7],
  ...slides.slice(10),
];

const candidatePath = path.join(outDir, "carestead-pitch-v2.candidate.pptx");
await (await PresentationFile.exportPptx(deck)).save(candidatePath);
for (let i = 0; i < orderedSlides.length; i++) {
  const png = await deck.export({ slide: orderedSlides[i], format: "png", scale: 1 });
  await fs.writeFile(path.join(outDir, `slide-${String(i + 1).padStart(2, "0")}.png`), new Uint8Array(await png.arrayBuffer()));
  const layout = await orderedSlides[i].export({ format: "layout" });
  await fs.writeFile(path.join(outDir, `slide-${String(i + 1).padStart(2, "0")}.layout.json`), await layout.text());
}
console.log(candidatePath);
