import { useState } from "react";
import { explainFile } from "@shared/services/explainFileService";
import type { CodeExplanation } from "@shared/types/types";
import sampleCode from "@shared/data/sampleCode.txt?raw";
import "@/App.css";

export default function CodeExplainPlayground() {
  const [code, setCode] = useState(sampleCode);
  const [result, setResult] = useState<CodeExplanation | null>(null);
  const [error, setError] = useState("");

  const [loading, setLoading] = useState(false);

  const explanationStatus = loading ? "Generating" : result ? "Ready" : "Waiting";

  async function handleExplain() {
    try {
      setLoading(true);
      setError("");

      const explanation = await explainFile(code);

      setResult(explanation);
    } catch (error) {
      console.error(error);
      setResult(null);
      setError("Explain failed.");
    } finally {
      setLoading(false);
    }
  }

  function renderSectionTitle(title: string, meta?: string) {
    return (
      <div className="playground__section-header">
        <h3>{title}</h3>
        {meta ? <span>{meta}</span> : null}
      </div>
    );
  }

  return (
    <main className="playground">
      <div className="playground__shell">
        <header className="playground__hero">
          <div>
            <p className="playground__eyebrow">Code Explain Playground</p>
            <h1>把代码拆成结构化说明</h1>
            <p className="playground__lede">
              import sampleCode from "@shared/data/sampleCode.txt?raw"; 输入一段 TypeScript 或
              JavaScript, 点击 Explain, 左边看源码, 右边看 AI 生成的分段解释。
            </p>
          </div>
        </header>

        {error ? <div className="playground__alert">{error}</div> : null}

        <div className="playground__grid">
          <section className="playground__panel">
            <div className="playground__panel-header">
              <div>
                <span className="playground__panel-kicker">Input</span>
                <h2>Source Code</h2>
              </div>
              <span className="playground__panel-meta">{code.length} chars</span>
            </div>

            <textarea
              value={code}
              onChange={(event) => setCode(event.target.value)}
              spellCheck={false}
              className="playground__editor"
            />

            <p className="playground__hint">
              支持函数、组件、工具类代码，建议一次粘贴 20 行以内更容易读。
            </p>
          </section>

          <section className="playground__panel playground__panel--output">
            <div className="playground__panel-header">
              <div>
                <span className="playground__panel-kicker">Output</span>
                <h2>Explanation</h2>
              </div>
              <span className="playground__panel-meta">{explanationStatus}</span>
            </div>

            <div className="playground__result">
              {loading ? (
                <div className="playground__empty-state">
                  <div className="playground__spinner" />
                  <strong>Explaining…</strong>
                  <span>正在整理文件作用、主逻辑、函数与注意事项。</span>
                </div>
              ) : result ? (
                <div className="playground__sections">
                  <section className="playground__section">
                    {renderSectionTitle("Summary")}
                    <p className="playground__summary">{result.summary}</p>
                  </section>

                  <section className="playground__section">
                    {renderSectionTitle("Main Logic", `${result.mainLogic.length} points`)}
                    <ul className="playground__list">
                      {result.mainLogic.map((item, index) => (
                        <li key={`${index}-${item}`}>{item}</li>
                      ))}
                    </ul>
                  </section>

                  <section className="playground__section">
                    {renderSectionTitle("Functions", `${result.functions.length} entries`)}
                    <div className="playground__cards">
                      {result.functions.map((fn) => (
                        <article key={fn.name} className="playground__card">
                          <h4>{fn.name}</h4>
                          <p>{fn.summary}</p>
                        </article>
                      ))}
                    </div>
                  </section>

                  <section className="playground__section">
                    {renderSectionTitle("Notes", `${result.notes.length} items`)}
                    <ul className="playground__list playground__list--notes">
                      {result.notes.map((note, index) => (
                        <li key={`${index}-${note}`}>{note}</li>
                      ))}
                    </ul>
                  </section>
                </div>
              ) : (
                <div className="playground__empty-state">
                  <strong>Ready to explain</strong>
                  <span>点击 Explain 后，这里会显示分段摘要、主逻辑、函数说明和注意事项。</span>
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="playground__actions">
          <button onClick={handleExplain} className="playground__button" disabled={loading}>
            {loading ? "Explaining..." : "Explain code"}
          </button>
        </div>
      </div>
    </main>
  );
}
