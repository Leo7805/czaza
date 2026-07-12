/**
 * Runtime script for the CZaza description webview.
 *
 * The extension provider owns data loading and persistence. This script owns
 * local UI state, rendering, and posting user actions back to the extension host.
 */
const vscode = acquireVsCodeApi();

// Last description payload received from CzazaViewProvider.
let currentDescription = null;

// View-only state kept in the webview so tab/collapse choices survive re-renders.
let userDescriptionExpanded = true;
let aiDescriptionExpanded = true;
let fileDescriptionTab = "user";
let structureTab = "ai";
let lineTab = "ai";
let structureExpanded = true;
let lineExpanded = true;
let editingStructureId = "";
let editingLineNumber = 0;

// Analysis state is scoped by analysisType so line progress stays in the Line card.
let analysisStatus = "";
let analysisLabel = "";
let analysisType = "";
let analysisStartedAt = 0;
let analysisTimerId = 0;

// Provider messages are the only source of persisted description/explanation data.
window.addEventListener("message", (event) => {
  const message = event.data;

  if (message.type === "description") {
    const previousPath = currentDescription?.path;
    currentDescription = message;
    if (previousPath !== currentDescription.path) {
      userDescriptionExpanded = true;
      aiDescriptionExpanded = true;
      fileDescriptionTab = "user";
      structureTab = "ai";
      lineTab = "ai";
      structureExpanded = true;
      lineExpanded = true;
      editingStructureId = "";
      editingLineNumber = 0;
    }
    render();
  }

  if (message.type === "analysisResult") {
    finishAnalysis(message);
  }
});

/**
 * Re-renders the whole description panel from the latest provider payload.
 */
function render() {
  const description = document.getElementById("description");

  if (!currentDescription || !currentDescription.fileName) {
    description.innerHTML = '<div class="description-empty">No file selected</div>';
    return;
  }

  const categoryBadge = currentDescription.category
    ? `<span class="description-badge">${escapeHtml(currentDescription.category)}</span>`
    : "";
  const fileDescriptionCard = renderFileDescriptionCard(currentDescription);
  const structureCard = renderStructureCard(currentDescription);
  const lineCard = renderLineCard(currentDescription);

  description.innerHTML = `
	        <section class="description-panel">
	          <div class="description-panel__header">
	            <div class="file-name" title="${escapeHtml(currentDescription.fileName)}">
	              ${escapeHtml(currentDescription.fileName)}
	            </div>
	            ${categoryBadge}
	          </div>
		          <div class="description-panel__body">
			            ${fileDescriptionCard}
			            ${structureCard}
			            ${lineCard}
		          </div>
	        </section>
	      `;
}

/**
 * Renders the combined file-level Description card with User/AI tabs.
 */
function renderFileDescriptionCard(currentDescription) {
  const highlightColor = sanitizeCssColor(currentDescription.highlightColor);
  const hasUserDescription = Boolean(currentDescription.hasUserDescription);
  const userCardClass = hasUserDescription
    ? "description-card description-card--user"
    : "description-card description-card--user description-card--muted";
  const bodyClass = hasUserDescription
    ? "description-card__body"
    : "description-card__body description-card__body--muted";
  const descriptionText = currentDescription.description ?? "No description yet.";
  const editAction =
    currentDescription.isEditing || !currentDescription.canEditDescription
      ? ""
      : renderEditAction();
  const userContent = currentDescription.isEditing
    ? renderEditor(descriptionText)
    : `
			          <p class="${bodyClass}">${escapeHtml(descriptionText)}</p>
			          ${editAction ? `<div class="description-actions">${editAction}</div>` : ""}
			        `;
  const fileAiContent = renderFileAiDescription(currentDescription);
  const body = userDescriptionExpanded
    ? fileDescriptionTab === "user"
      ? userContent
      : fileAiContent
    : "";
  const cardClass =
    fileDescriptionTab === "user" ? userCardClass : "description-card description-card--ai";

  return `
			        <section class="${cardClass}" style="--czaza-description-highlight: ${highlightColor}">
			          <div class="description-card__head">
			            ${renderCardTitle("Description", ["file"])}
			            ${renderCardControls("file", fileDescriptionTab, userDescriptionExpanded, "toggleUserDescription()")}
			          </div>
			          ${body}
			        </section>
		      `;
}

/**
 * Renders the AI side of the file Description card.
 */
function renderFileAiDescription(currentDescription) {
  if (!currentDescription.canEditDescription) {
    return "";
  }

  const summary = String(currentDescription.aiDescription ?? "").trim();
  const detail = String(currentDescription.aiDetail ?? "").trim();
  const notes = Array.isArray(currentDescription.aiNotes) ? currentDescription.aiNotes : [];
  const hasAiDescription = Boolean(summary || detail || notes.length > 0);
  const isAnalyzing =
    isAnalysisRunning("analyzeFileStructure") || isAnalysisRunning("analyzeSemantic");
  const isStale = Boolean(currentDescription.aiIsStale);
  const body = renderAiCardBody(summary, detail, notes, hasAiDescription, isAnalyzing, isStale);
  const actions = renderAiCardActions(hasAiDescription, isAnalyzing, isStale);

  return body + actions;
}

/**
 * Renders file-level AI summary content, including loading and stale states.
 */
function renderAiCardBody(summary, detail, notes, hasAiDescription, isAnalyzing, isStale) {
  if (isAnalyzing) {
    const status = analysisStatus || "Analyzing file and structure units...";
    return `<p class="description-card__faint analysis-status">${escapeHtml(status)}</p>`;
  }

  if (!hasAiDescription) {
    return `<p class="description-card__faint">Run AI analysis to summarize this file's role and structure.</p>`;
  }

  const body = [
    summary ? `<p class="description-card__body">${escapeHtml(summary)}</p>` : "",
    detail ? `<p class="description-card__body">${escapeHtml(detail)}</p>` : "",
    notes.length > 0
      ? `<p class="description-card__faint"><strong>AI notes:</strong> ${escapeHtml(notes.join(" "))}</p>`
      : "",
  ].join("");
  const staleMeta = isStale
    ? `<div class="description-meta"><span class="description-meta__dot description-meta__dot--warn"></span>File changed; this description may be outdated.</div>`
    : `<div class="description-meta"><span class="description-meta__dot"></span>Generated by AI analysis.</div>`;

  return body + staleMeta;
}

/**
 * Renders the file-level AI analyze/update action.
 */
function renderAiCardActions(hasAiDescription, isAnalyzing, isStale) {
  const disabled = isAnalyzing ? " disabled" : "";
  const primaryLabel = isAnalyzing
    ? '<span class="spinner"></span> Analyzing'
    : hasAiDescription
      ? "Update"
      : "Analyze";
  const primaryClass = isStale
    ? "description-button description-button--warn"
    : "description-button description-button--ai";

  return `
		        <div class="description-actions">
		          <button class="${primaryClass}" type="button" onclick="analyzeFileStructure()"${disabled}>
		            ${primaryLabel}
		          </button>
		        </div>
		      `;
}

/**
 * Renders the currently active structure unit card.
 */
function renderStructureCard(currentDescription) {
  if (!currentDescription.canEditDescription) {
    return "";
  }

  const activeLine = currentDescription.activeLine;
  const activeStructure = currentDescription.activeStructure;
  const hasStructureMetadata = Boolean(currentDescription.hasStructureMetadata);
  const titleBadges = [activeStructure?.kind].filter(Boolean);
  const body = structureExpanded
    ? renderStructureCardBody(activeStructure, activeLine, hasStructureMetadata)
    : "";
  const actions =
    structureExpanded && structureTab === "ai"
      ? `
		          <div class="description-actions">
		            <button class="description-button description-button--structure" type="button" onclick="analyzeFileStructure()">
		              Update
		            </button>
		          </div>
		        `
      : "";

  return `
		        <section class="description-card description-card--structure">
		          <div class="description-card__head">
		            ${renderCardTitle("Structure", titleBadges)}
		            ${renderCardControls("structure", structureTab, structureExpanded, "toggleStructure()")}
		          </div>
		          ${body}
		          ${actions}
		        </section>
		      `;
}

/**
 * Renders Structure tab content for either AI explanation or user notes.
 */
function renderStructureCardBody(activeStructure, activeLine, hasStructureMetadata) {
  if (structureTab === "user") {
    return renderStructureUserNotes(activeStructure, activeLine, hasStructureMetadata);
  }

  if (!activeLine) {
    return `<p class="description-card__faint">Place the cursor in the editor to inspect the current structure.</p>`;
  }

  if (!hasStructureMetadata) {
    return `
		          <p class="description-card__faint">
		            No structure analysis is available for this file yet.
		          </p>
		        `;
  }

  if (!activeStructure) {
    return `
	          <p class="description-card__body description-card__body--muted">
	            No detected structure at line ${escapeHtml(activeLine)}.
	          </p>
		          <p class="description-card__faint">
		            This line is outside detected functions, classes, components, or top-level declarations.
		          </p>
		        `;
  }

  const rangeText =
    activeStructure.startLine === activeStructure.endLine
      ? `line ${activeStructure.startLine}`
      : `lines ${activeStructure.startLine}-${activeStructure.endLine}`;
  const summary = String(activeStructure.summary ?? "").trim();
  const detail = String(activeStructure.detail ?? "").trim();
  const notes = Array.isArray(activeStructure.aiNotes) ? activeStructure.aiNotes : [];
  const body = [
    `<p class="description-card__body"><strong>${escapeHtml(activeStructure.name)}</strong> <span class="description-card__faint">${escapeHtml(rangeText)}</span></p>`,
    summary ? `<p class="description-card__body">${escapeHtml(summary)}</p>` : "",
    detail ? `<p class="description-card__body">${escapeHtml(detail)}</p>` : "",
    notes.length > 0
      ? `<p class="description-card__faint"><strong>AI notes:</strong> ${escapeHtml(notes.join(" "))}</p>`
      : "",
  ];

  return body.join("");
}

/**
 * Renders editable user notes for the active structure unit.
 */
function renderStructureUserNotes(activeStructure, activeLine, hasStructureMetadata) {
  if (!activeLine) {
    return `<p class="description-card__faint">Place the cursor in the editor to add structure notes.</p>`;
  }

  if (!hasStructureMetadata || !activeStructure) {
    return `<p class="description-card__faint">No detected structure is available for user notes at this line.</p>`;
  }

  const value = notesToText(activeStructure.userNotes);
  const isEditing = editingStructureId === activeStructure.id;

  if (!isEditing) {
    return renderUserNoteView(
      value,
      "No user notes yet.",
      `startStructureNotesEdit('${escapeHtml(activeStructure.id)}')`,
    );
  }

  return `
	        <div class="description-notes">
	          <textarea
	            id="structure-user-notes"
	            class="description-textarea"
	            spellcheck="false"
	          >${escapeHtml(value)}</textarea>
	          <div class="description-actions">
	            <button
	              class="description-button description-button--structure"
	              type="button"
	              onclick="saveStructureUserNotes('${escapeHtml(activeStructure.id)}')"
	            >
	              Save notes
	            </button>
	            <button
	              class="description-button description-button--secondary"
	              type="button"
	              onclick="cancelStructureNotesEdit()"
	            >
	              Cancel
	            </button>
	          </div>
	        </div>
	      `;
}

/**
 * Renders the active line card and keeps line-analysis progress local to it.
 */
function renderLineCard(currentDescription) {
  if (!currentDescription.canEditDescription) {
    return "";
  }

  const activeLine = currentDescription.activeLine;
  const lineExplanation = currentDescription.activeLineExplanation;
  const titleBadges = activeLine ? [`Line ${activeLine}`] : [];
  const isAnalyzingLine = isAnalysisRunning("analyzeLineRange");
  const body = lineExpanded
    ? isAnalyzingLine
      ? `<p class="description-card__faint analysis-status">${escapeHtml(analysisStatus || "Analyzing nearby lines...")}</p>`
      : activeLine
        ? renderLineCardBody(activeLine, lineExplanation)
        : `<p class="description-card__faint">Place the cursor in the editor to inspect line-level analysis.</p>`
    : "";
  const actions =
    lineExpanded && lineTab === "ai"
      ? `
		          <div class="description-actions">
		            <button
		              class="description-button description-button--line"
		              type="button"
		              onclick="analyzeLineRange()"
		              ${activeLine && !isAnalyzingLine ? "" : " disabled"}
		            >
		              ${isAnalyzingLine ? '<span class="spinner"></span> Analyzing' : "Analyze line"}
		            </button>
		          </div>
		        `
      : "";

  return `
			        <section class="description-card description-card--line">
			          <div class="description-card__head">
			            ${renderCardTitle("Line", titleBadges)}
			            ${renderCardControls("line", lineTab, lineExpanded, "toggleLine()")}
			          </div>
			          ${body}
		          ${actions}
			        </section>
			      `;
}

/**
 * Renders Line tab content for either AI explanation or user notes.
 */
function renderLineCardBody(activeLine, lineExplanation) {
  if (lineTab === "user") {
    return renderLineUserNotes(activeLine, lineExplanation);
  }

  if (!lineExplanation) {
    return `
		          <p class="description-card__body description-card__body--muted">
		            No line analysis yet for line ${escapeHtml(activeLine)}.
		          </p>
		          <p class="description-card__faint">
		            Analyze line explains the current line and a small nearby range.
		          </p>
		        `;
  }

  const summary = String(lineExplanation.summary ?? "").trim();
  const detail = String(lineExplanation.detail ?? "").trim();
  const notes = Array.isArray(lineExplanation.aiNotes) ? lineExplanation.aiNotes : [];
  const parts = [
    summary ? `<p class="description-card__body">${escapeHtml(summary)}</p>` : "",
    detail ? `<p class="description-card__body">${escapeHtml(detail)}</p>` : "",
    notes.length > 0
      ? `<p class="description-card__faint"><strong>AI notes:</strong> ${escapeHtml(notes.join(" "))}</p>`
      : "",
  ];

  return parts.join("");
}

/**
 * Renders editable user notes for the active line.
 */
function renderLineUserNotes(activeLine, lineExplanation) {
  const value = notesToText(lineExplanation?.userNotes);
  const lineNumber = Number(activeLine) || 1;
  const isEditing = editingLineNumber === lineNumber;

  if (!isEditing) {
    return renderUserNoteView(value, "No user notes yet.", `startLineNotesEdit(${lineNumber})`);
  }

  return `
	        <div class="description-notes">
	          <textarea
	            id="line-user-notes"
	            class="description-textarea"
	            spellcheck="false"
	          >${escapeHtml(value)}</textarea>
	          <div class="description-actions">
	            <button
	              class="description-button description-button--line"
	              type="button"
	              onclick="saveLineUserNotes(${lineNumber})"
	            >
	              Save notes
	            </button>
	            <button
	              class="description-button description-button--secondary"
	              type="button"
	              onclick="cancelLineNotesEdit()"
	            >
	              Cancel
	            </button>
	          </div>
	        </div>
	      `;
}

/**
 * Renders a read-only note block with an edit affordance that does not move layout.
 */
function renderUserNoteView(value, emptyText, editHandler) {
  const text = String(value ?? "").trim();
  const bodyClass = text
    ? "description-card__body"
    : "description-card__body description-card__body--muted";
  const bodyText = text || emptyText;

  return `
	        <div class="description-note-view">
	          <p class="${bodyClass}">${escapeHtml(bodyText)}</p>
	          ${renderInlineEditAction(editHandler)}
	        </div>
	      `;
}

/**
 * Renders the pencil button used by read-only note displays.
 */
function renderInlineEditAction(editHandler) {
  return `
	        <button
	          class="description-icon-button"
	          type="button"
	          title="Edit notes"
	          aria-label="Edit notes"
	          onclick="${editHandler}"
	        >
	          <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
	            <path
	              fill="currentColor"
	              d="M11.6 1.7a1.3 1.3 0 0 1 1.8 0l.9.9a1.3 1.3 0 0 1 0 1.8l-7.7 7.7-3.1.8.8-3.1 7.3-8.1Zm-.8 2.4-5.6 6.2-.3 1.1 1.1-.3 6-6-.2-.2-1-1Zm1.8-1.4-.8.8 1 1 .8-.8-.9-.9-.1-.1Z"
	            ></path>
	          </svg>
	        </button>
	      `;
}

/**
 * Renders a compact User/AI segmented control.
 */
function renderTabs(group, activeTab) {
  return `
	        <div class="description-tabs" role="tablist">
	          <button
	            class="description-tab ${activeTab === "user" ? "description-tab--active" : ""}"
	            type="button"
	            onclick="setDescriptionTab('${group}', 'user')"
	          >
	            User
	          </button>
	          <button
	            class="description-tab ${activeTab === "ai" ? "description-tab--active" : ""}"
	            type="button"
	            onclick="setDescriptionTab('${group}', 'ai')"
	          >
	            AI
	          </button>
	        </div>
	      `;
}

/**
 * Renders the left side of a card header, including optional semantic badges.
 */
function renderCardTitle(title, badges) {
  const badgeHtml = (Array.isArray(badges) ? badges : [])
    .filter(Boolean)
    .map((badge) => {
      const modifier =
        title === "Structure"
          ? " description-card__mini-badge--structure"
          : title === "Line"
            ? " description-card__mini-badge--line"
            : "";

      return `<span class="description-card__mini-badge${modifier}">${escapeHtml(badge)}</span>`;
    })
    .join("");

  return `
	        <div class="description-card__title-group">
	          <span class="description-card__title">${escapeHtml(title)}</span>
	          ${badgeHtml ? `<span class="description-card__badges">${badgeHtml}</span>` : ""}
	        </div>
	      `;
}

/**
 * Renders the fixed right side of a card header: tabs plus collapse button.
 */
function renderCardControls(group, activeTab, expanded, toggleHandler) {
  return `
	        <div class="description-card__controls">
	          ${renderTabs(group, activeTab)}
	          <button
	            class="description-card__collapse"
	            type="button"
	            title="${expanded ? "Collapse" : "Expand"}"
	            aria-label="${expanded ? "Collapse" : "Expand"}"
	            aria-expanded="${expanded ? "true" : "false"}"
	            onclick="${toggleHandler}"
	          >
	            <span class="description-card__collapse-icon" aria-hidden="true">${expanded ? "-" : "+"}</span>
	          </button>
	        </div>
	      `;
}

/**
 * Renders the file description edit button.
 */
function renderEditAction() {
  return `
        <button
          class="description-icon-button"
          type="button"
          title="Edit description"
          aria-label="Edit description"
          onclick="startEdit()"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path
              fill="currentColor"
              d="M11.6 1.7a1.3 1.3 0 0 1 1.8 0l.9.9a1.3 1.3 0 0 1 0 1.8l-7.7 7.7-3.1.8.8-3.1 7.3-8.1Zm-.8 2.4-5.6 6.2-.3 1.1 1.1-.3 6-6-.2-.2-1-1Zm1.8-1.4-.8.8 1 1 .8-.8-.9-.9-.1-.1Z"
            ></path>
          </svg>
        </button>
      `;
}

/**
 * Renders the textarea editor used for the file-level user description.
 */
function renderEditor(value) {
  return `
        <div class="description-editor">
          <textarea
            id="description-editor"
            class="description-textarea"
            spellcheck="false"
          >${escapeHtml(value)}</textarea>
          <div class="description-actions">
            <button class="description-button" onclick="saveDescription()">Save</button>
            <button
              class="description-button description-button--secondary"
              onclick="cancelEdit()"
            >
              Cancel
            </button>
          </div>
        </div>
      `;
}

/**
 * Posts the file-level user description back to the extension host.
 */
function saveDescription() {
  const editor = document.getElementById("description-editor");

  vscode.postMessage({
    type: "saveDescription",
    description: editor ? editor.value : "",
  });
}

/**
 * Requests that the provider switch the file Description card into edit mode.
 */
function startEdit() {
  vscode.postMessage({
    type: "startEdit",
  });
}

/**
 * Cancels file Description editing in the extension host.
 */
function cancelEdit() {
  vscode.postMessage({
    type: "cancelEdit",
  });
}

/**
 * Starts file/structure AI analysis for the current resource.
 */
function analyzeFileStructure() {
  postAnalysisMessage("analyzeFileStructure", "file and structure units");
}

/**
 * Starts semantic analysis for the current resource.
 */
function analyzeSemantic() {
  postAnalysisMessage("analyzeSemantic", "semantic units");
}

/**
 * Starts nearby-line analysis for the active editor line.
 */
function analyzeLineRange() {
  postAnalysisMessage("analyzeLineRange", "nearby lines");
}

/**
 * Starts local progress UI and asks the extension host to execute an analysis command.
 */
function postAnalysisMessage(type, label) {
  if (analysisStartedAt > 0) {
    return;
  }

  analysisLabel = label;
  analysisType = type;
  analysisStartedAt = Date.now();
  updateAnalysisStatus();
  startAnalysisTimer();
  render();
  vscode.postMessage({ type });
}

/**
 * Starts the interval that updates elapsed analysis time.
 */
function startAnalysisTimer() {
  stopAnalysisTimer();
  analysisTimerId = window.setInterval(() => {
    updateAnalysisStatus();
    updateAnalysisStatusElement();
  }, 1000);
}

/**
 * Stops the active analysis status interval.
 */
function stopAnalysisTimer() {
  if (analysisTimerId) {
    window.clearInterval(analysisTimerId);
    analysisTimerId = 0;
  }
}

/**
 * Recomputes the human-readable analysis status label.
 */
function updateAnalysisStatus() {
  if (!analysisStartedAt) {
    return;
  }

  const elapsedMs = Date.now() - analysisStartedAt;
  const dots = ".".repeat(Math.floor(elapsedMs / 1000) % 4);
  analysisStatus = `Analyzing ${analysisLabel}${dots} ${formatElapsed(elapsedMs)}`;
}

/**
 * Updates the visible status node without forcing a full render on every tick.
 */
function updateAnalysisStatusElement() {
  const statusElement = document.querySelector(".analysis-status");

  if (statusElement) {
    statusElement.textContent = analysisStatus;
  }
}

/**
 * Handles analysis completion from the extension host and refreshes the card body.
 */
function finishAnalysis(message) {
  stopAnalysisTimer();
  analysisStartedAt = 0;
  analysisLabel = String(message.label ?? analysisLabel);
  analysisType = "";

  if (message.ok) {
    analysisStatus = `Finished ${analysisLabel} in ${formatElapsed(message.elapsedMs)}.`;
  } else {
    const errorMessage = message.message ? ` ${message.message}` : "";
    analysisStatus = `Failed ${analysisLabel} after ${formatElapsed(message.elapsedMs)}.${errorMessage}`;
  }

  render();
}

/**
 * Formats elapsed milliseconds for compact progress labels.
 */
function formatElapsed(elapsedMs) {
  const seconds = Math.max(0, Number(elapsedMs) || 0) / 1000;

  if (seconds < 10) {
    return `${seconds.toFixed(1)}s`;
  }

  return `${Math.round(seconds)}s`;
}

/**
 * Toggles the combined file Description card body.
 */
function toggleUserDescription() {
  userDescriptionExpanded = !userDescriptionExpanded;
  aiDescriptionExpanded = userDescriptionExpanded;
  render();
}

/**
 * Legacy paired toggle kept so existing onclick handlers remain valid.
 */
function toggleAiDescription() {
  aiDescriptionExpanded = !aiDescriptionExpanded;
  userDescriptionExpanded = aiDescriptionExpanded;
  render();
}

/**
 * Toggles the Structure card body.
 */
function toggleStructure() {
  structureExpanded = !structureExpanded;
  render();
}

/**
 * Toggles the Line card body.
 */
function toggleLine() {
  lineExpanded = !lineExpanded;
  render();
}

/**
 * Switches the active tab group without changing the current resource.
 */
function setDescriptionTab(group, tab) {
  if (group === "file") {
    fileDescriptionTab = tab;
  }

  if (group === "structure") {
    structureTab = tab;
  }

  if (group === "line") {
    lineTab = tab;
  }

  render();
}

/**
 * Opens the active structure's user notes editor.
 */
function startStructureNotesEdit(structureId) {
  editingStructureId = structureId;
  render();
}

/**
 * Closes the structure notes editor without posting changes.
 */
function cancelStructureNotesEdit() {
  editingStructureId = "";
  render();
}

/**
 * Opens the active line's user notes editor.
 */
function startLineNotesEdit(lineNumber) {
  editingLineNumber = Number(lineNumber) || 0;
  render();
}

/**
 * Closes the line notes editor without posting changes.
 */
function cancelLineNotesEdit() {
  editingLineNumber = 0;
  render();
}

/**
 * Posts structure user notes to the extension host.
 */
function saveStructureUserNotes(structureId) {
  const editor = document.getElementById("structure-user-notes");
  editingStructureId = "";

  vscode.postMessage({
    type: "saveStructureUserNotes",
    structureId,
    notes: editor ? editor.value : "",
  });
}

/**
 * Posts line user notes to the extension host.
 */
function saveLineUserNotes(lineNumber) {
  const editor = document.getElementById("line-user-notes");
  editingLineNumber = 0;

  vscode.postMessage({
    type: "saveLineUserNotes",
    lineNumber,
    notes: editor ? editor.value : "",
  });
}

/**
 * Converts stored user notes into textarea/display text.
 */
function notesToText(notes) {
  return Array.isArray(notes) ? notes.join("\\n\\n") : "";
}

/**
 * Checks whether the current analysis progress belongs to a specific command.
 */
function isAnalysisRunning(type) {
  return analysisStartedAt > 0 && analysisType === type;
}

/**
 * Escapes text before inserting it into webview HTML strings.
 */
function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Restricts user-configured CSS colors before writing them into inline style.
 */
function sanitizeCssColor(value) {
  const color = String(value || "#22c55e").trim();

  if (/^[#a-zA-Z0-9(),.%\\s-]+$/.test(color)) {
    return color;
  }

  return "#22c55e";
}
