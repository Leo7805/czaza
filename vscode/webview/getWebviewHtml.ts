export function getWebviewHtml() {
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    :root {
      color-scheme: light dark;
    }

    body {
      margin: 0;
      padding: 10px;
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      line-height: 1.45;
    }

    .description-view {
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-width: 0;
    }

    .description-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
      min-width: 0;
    }

    .description-title {
      min-width: 0;
      font-size: 13px;
      font-weight: 600;
      color: var(--vscode-foreground);
      overflow-wrap: anywhere;
    }

    .description-path {
      margin-top: 2px;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      overflow-wrap: anywhere;
    }

    .description-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      flex: 0 0 auto;
      max-width: 45%;
    }

    .description-badge {
      max-width: 100%;
      padding: 1px 0;
      border: 0;
      border-radius: 0;
      color: var(--vscode-descriptionForeground);
      background: transparent;
      font-size: 11px;
      font-weight: 600;
      line-height: 16px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-transform: uppercase;
    }

    .description-section {
      position: relative;
      padding-top: 10px;
      border-top: 1px solid var(--vscode-panel-border);
    }

    .description-section--highlight {
      padding: 8px;
      border: 1px solid var(--czaza-description-highlight);
      border-left-width: 3px;
      border-radius: 4px;
      background: color-mix(in srgb, var(--czaza-description-highlight) 14%, transparent);
    }

    .description-section--highlight .description-section-title {
      color: var(--czaza-description-highlight);
    }

    .description-section-title {
      padding-right: 28px;
      margin-bottom: 6px;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .description-body {
      margin: 0;
      color: var(--vscode-foreground);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .description-editor {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .description-textarea {
      box-sizing: border-box;
      width: 100%;
      min-height: 110px;
      padding: 6px;
      border: 1px solid var(--vscode-input-border);
      border-radius: 2px;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      font: inherit;
      resize: vertical;
    }

    .description-actions {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }

    .ai-actions {
      padding: 10px;
      border: 1px solid var(--vscode-focusBorder);
      border-left-width: 3px;
      border-radius: 4px;
      background: color-mix(in srgb, var(--vscode-focusBorder) 13%, transparent);
    }

    .ai-actions__body {
      display: flex;
      flex-direction: column;
      gap: 7px;
    }

    .ai-actions__buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .ai-actions__status {
      min-height: 16px;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      line-height: 16px;
    }

    .description-button {
      padding: 3px 10px;
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 2px;
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      font: inherit;
      cursor: pointer;
    }

    .description-button:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .description-button:disabled {
      opacity: 0.65;
      cursor: default;
    }

    .description-icon-button {
      position: absolute;
      top: 6px;
      right: 4px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      padding: 0;
      border: 1px solid transparent;
      border-radius: 3px;
      color: var(--vscode-icon-foreground);
      background: transparent;
      opacity: 0;
      cursor: pointer;
      transition: opacity 80ms ease-in-out, background-color 80ms ease-in-out;
    }

    .description-section:hover .description-icon-button,
    .description-icon-button:focus-visible {
      opacity: 1;
    }

    .description-icon-button:hover,
    .description-icon-button:focus-visible {
      background: var(--vscode-toolbar-hoverBackground);
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: -1px;
    }

    .description-icon-button svg {
      width: 14px;
      height: 14px;
      pointer-events: none;
    }

    .description-button--secondary {
      color: var(--vscode-button-secondaryForeground);
      background: var(--vscode-button-secondaryBackground);
    }

    .description-button--secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    .description-empty {
      padding: 10px 0;
      color: var(--vscode-descriptionForeground);
      font-style: italic;
    }

    .file-roles {
      padding-top: 8px;
      border-top: 1px solid var(--vscode-panel-border);
    }

    .file-roles__toggle {
      display: flex;
      align-items: center;
      width: 100%;
      min-height: 28px;
      padding: 0;
      border: 0;
      color: var(--vscode-foreground);
      background: transparent;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }

    .file-roles__toggle:hover {
      color: var(--vscode-list-hoverForeground, var(--vscode-foreground));
    }

    .file-roles__toggle:focus-visible {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: -1px;
    }

    .file-roles__mark {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
      width: 18px;
      height: 18px;
      margin-right: 4px;
      color: var(--vscode-icon-foreground);
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 13px;
      line-height: 1;
    }

    .file-roles__title {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0;
      text-transform: uppercase;
    }

    .file-roles__count {
      margin-left: 6px;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
    }

    .file-roles__panel {
      display: none;
      flex-direction: column;
      gap: 2px;
      margin-top: 4px;
      padding: 4px 0;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      background: var(--vscode-editor-background);
    }

    .file-roles--expanded .file-roles__panel {
      display: flex;
    }

    .file-role {
      display: grid;
      grid-template-columns: 16px minmax(8ch, var(--file-role-name-width, 18ch)) minmax(0, 1fr);
      gap: 7px;
      align-items: start;
      min-width: 0;
      padding: 5px 8px;
    }

    .file-role:hover {
      background: var(--vscode-list-hoverBackground);
    }

    .file-role__icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      margin-top: 1px;
      border-radius: 2px;
      color: #ffffff;
      background: #007acc;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 8px;
      font-weight: 700;
      line-height: 1;
      text-transform: uppercase;
    }

    .file-role__icon--directory {
      color: var(--vscode-sideBarTitle-foreground, var(--vscode-foreground));
      background: #dcb67a;
    }

    .file-role__name {
      min-width: 0;
      color: var(--vscode-foreground);
      font-family: var(--vscode-editor-font-family, var(--vscode-font-family));
      font-size: 12px;
      line-height: 18px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .file-role__description {
      min-width: 0;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      line-height: 18px;
      overflow: hidden;
      overflow-wrap: anywhere;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }
  </style>
</head>
<body>
  <div id="app">
    <div id="description" class="description-view">
      <em>No file selected</em>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let currentDescription = null;
    let fileRolesExpanded = false;
    let analysisStatus = "";
    let analysisLabel = "";
    let analysisStartedAt = 0;
    let analysisTimerId = 0;

    window.addEventListener("message", event => {
      const message = event.data;

      if (message.type === "description") {
        currentDescription = message;
        fileRolesExpanded = false;
        render();
      }

      if (message.type === "analysisResult") {
        finishAnalysis(message);
      }
    });

    function render() {
      const description = document.getElementById("description");

      if (!currentDescription || !currentDescription.fileName) {
        description.innerHTML = '<div class="description-empty">No file selected</div>';
        return;
      }

      const categoryBadge = currentDescription.category;
      const descriptionText = escapeHtml(currentDescription.description ?? "No description yet.");
      const highlightColor = sanitizeCssColor(currentDescription.highlightColor);
      const descriptionSectionClass = currentDescription.hasUserDescription
        ? "description-section description-section--highlight"
        : "description-section";
      const descriptionContent = currentDescription.isEditing
        ? renderEditor(currentDescription.description ?? "")
        : \`<p class="description-body">\${descriptionText}</p>\`;
      const editAction = currentDescription.isEditing || !currentDescription.canEditDescription
        ? ""
        : renderEditAction();
      const aiActions = renderAiActions(currentDescription);
      const aiDescription = renderAiDescription(currentDescription);
      const fileRoles = renderFileRoles(currentDescription.fileRoles ?? []);

      description.innerHTML = \`
        <div class="description-header">
          <div class="description-title">\${escapeHtml(currentDescription.fileName)}</div>
          <div class="description-badges">
            \${categoryBadge ? \`<span class="description-badge">\${escapeHtml(categoryBadge)}</span>\` : ""}
          </div>
        </div>

        <section
          class="\${descriptionSectionClass}"
          style="--czaza-description-highlight: \${highlightColor}"
        >
          <div class="description-section-title">Description</div>
          \${editAction}
          \${descriptionContent}
        </section>

        \${aiActions}
        \${aiDescription}
        \${fileRoles}
      \`;
    }

    function renderAiActions(currentDescription) {
      if (!currentDescription.canEditDescription) {
        return "";
      }

      const status = analysisStatus
        ? \`<div class="ai-actions__status">\${escapeHtml(analysisStatus)}</div>\`
        : "";
      const disabled = analysisStartedAt > 0 ? " disabled" : "";

      return \`
        <section class="ai-actions">
          <div class="description-section-title">AI Analysis</div>
          <div class="ai-actions__body">
            <div class="ai-actions__buttons">
              <button class="description-button" type="button" onclick="analyzeFileStructure()"\${disabled}>
                Analyze File
              </button>
              <button
                class="description-button description-button--secondary"
                type="button"
                onclick="analyzeSemantic()"
                \${disabled}
              >
                Semantic
              </button>
              <button
                class="description-button description-button--secondary"
                type="button"
                onclick="analyzeLineRange()"
                \${disabled}
              >
                Nearby Lines
              </button>
            </div>
            \${status}
          </div>
        </section>
      \`;
    }

    function renderAiDescription(currentDescription) {
      const summary = String(currentDescription.aiDescription ?? "").trim();
      const detail = String(currentDescription.aiDetail ?? "").trim();
      const notes = Array.isArray(currentDescription.aiNotes) ? currentDescription.aiNotes : [];

      if (!summary && !detail && notes.length === 0) {
        return "";
      }

      const body = [
        summary ? \`<p class="description-body">\${escapeHtml(summary)}</p>\` : "",
        detail ? \`<p class="description-body">\${escapeHtml(detail)}</p>\` : "",
        notes.length > 0
          ? \`<p class="description-body"><strong>AI notes:</strong> \${escapeHtml(notes.join(" "))}</p>\`
          : "",
      ].join("");

      return \`
        <section class="description-section">
          <div class="description-section-title">AI Description</div>
          \${body}
        </section>
      \`;
    }

    function renderEditAction() {
      return \`
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
      \`;
    }

    function renderFileRoles(fileRoles) {
      if (!Array.isArray(fileRoles) || fileRoles.length === 0) {
        return "";
      }

      const longestName = fileRoles.reduce((max, item) => {
        return Math.max(max, String(item.name ?? "").length);
      }, 0);
      const fileNameWidth = Math.min(Math.max(longestName, 8), 32);
      const expandedClass = fileRolesExpanded ? " file-roles--expanded" : "";
      const mark = fileRolesExpanded ? "-" : "+";
      const rows = fileRoles.map(renderFileRole).join("");

      return \`
        <section
          class="file-roles\${expandedClass}"
          style="--file-role-name-width: \${fileNameWidth}ch"
        >
          <button
            class="file-roles__toggle"
            type="button"
            aria-expanded="\${fileRolesExpanded ? "true" : "false"}"
            onclick="toggleFileRoles()"
          >
            <span class="file-roles__mark" aria-hidden="true">\${mark}</span>
            <span class="file-roles__title">File Roles</span>
            <span class="file-roles__count">\${fileRoles.length}</span>
          </button>
          <div class="file-roles__panel">
            \${rows}
          </div>
        </section>
      \`;
    }

    function renderFileRole(fileRole) {
      const name = String(fileRole.name ?? "");
      const description = String(fileRole.description ?? "");
      const isDirectory = fileRole.kind === "directory";
      const ext = isDirectory ? "DIR" : getFileExtensionLabel(name);
      const iconClass = isDirectory
        ? "file-role__icon file-role__icon--directory"
        : "file-role__icon";

      return \`
        <div class="file-role" title="\${escapeHtml(description)}">
          <span class="\${iconClass}" aria-hidden="true">\${escapeHtml(ext)}</span>
          <span class="file-role__name" title="\${escapeHtml(name)}">\${escapeHtml(name)}</span>
          <span class="file-role__description">\${escapeHtml(description)}</span>
        </div>
      \`;
    }

    function renderEditor(value) {
      return \`
        <div class="description-editor">
          <textarea
            id="description-editor"
            class="description-textarea"
            spellcheck="false"
          >\${escapeHtml(value)}</textarea>
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
      \`;
    }

    function saveDescription() {
      const editor = document.getElementById("description-editor");

      vscode.postMessage({
        type: "saveDescription",
        description: editor ? editor.value : "",
      });
    }

    function startEdit() {
      vscode.postMessage({
        type: "startEdit",
      });
    }

    function cancelEdit() {
      vscode.postMessage({
        type: "cancelEdit",
      });
    }

    function analyzeFileStructure() {
      postAnalysisMessage("analyzeFileStructure", "file and structure units");
    }

    function analyzeSemantic() {
      postAnalysisMessage("analyzeSemantic", "semantic units");
    }

    function analyzeLineRange() {
      postAnalysisMessage("analyzeLineRange", "nearby lines");
    }

    function postAnalysisMessage(type, label) {
      if (analysisStartedAt > 0) {
        return;
      }

      analysisLabel = label;
      analysisStartedAt = Date.now();
      updateAnalysisStatus();
      startAnalysisTimer();
      render();
      vscode.postMessage({ type });
    }

    function startAnalysisTimer() {
      stopAnalysisTimer();
      analysisTimerId = window.setInterval(() => {
        updateAnalysisStatus();
        updateAnalysisStatusElement();
      }, 1000);
    }

    function stopAnalysisTimer() {
      if (analysisTimerId) {
        window.clearInterval(analysisTimerId);
        analysisTimerId = 0;
      }
    }

    function updateAnalysisStatus() {
      if (!analysisStartedAt) {
        return;
      }

      const elapsedMs = Date.now() - analysisStartedAt;
      const dots = ".".repeat(Math.floor(elapsedMs / 1000) % 4);
      analysisStatus = \`Analyzing \${analysisLabel}\${dots} \${formatElapsed(elapsedMs)}\`;
    }

    function updateAnalysisStatusElement() {
      const statusElement = document.querySelector(".ai-actions__status");

      if (statusElement) {
        statusElement.textContent = analysisStatus;
      }
    }

    function finishAnalysis(message) {
      stopAnalysisTimer();
      analysisStartedAt = 0;
      analysisLabel = String(message.label ?? analysisLabel);

      if (message.ok) {
        analysisStatus = \`Finished \${analysisLabel} in \${formatElapsed(message.elapsedMs)}.\`;
      } else {
        const errorMessage = message.message ? \` \${message.message}\` : "";
        analysisStatus = \`Failed \${analysisLabel} after \${formatElapsed(message.elapsedMs)}.\${errorMessage}\`;
      }

      render();
    }

    function formatElapsed(elapsedMs) {
      const seconds = Math.max(0, Number(elapsedMs) || 0) / 1000;

      if (seconds < 10) {
        return \`\${seconds.toFixed(1)}s\`;
      }

      return \`\${Math.round(seconds)}s\`;
    }

    function toggleFileRoles() {
      fileRolesExpanded = !fileRolesExpanded;
      render();
    }

    function getFileExtensionLabel(fileName) {
      const lowerName = String(fileName).toLowerCase();

      if (lowerName.endsWith(".tsx")) {
        return "TSX";
      }

      if (lowerName.endsWith(".ts")) {
        return "TS";
      }

      if (lowerName.endsWith(".jsx")) {
        return "JSX";
      }

      if (lowerName.endsWith(".js")) {
        return "JS";
      }

      const extension = lowerName.split(".").pop();
      return extension && extension !== lowerName ? extension.slice(0, 3) : "F";
    }

    function escapeHtml(value) {
      return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    }

    function sanitizeCssColor(value) {
      const color = String(value || "#22c55e").trim();

      if (/^[#a-zA-Z0-9(),.%\\s-]+$/.test(color)) {
        return color;
      }

      return "#22c55e";
    }
  </script>
</body>
</html>
`;
}
