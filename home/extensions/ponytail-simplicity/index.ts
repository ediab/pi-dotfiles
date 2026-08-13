const SIMPLICITY_RULES = `
# Implementation Simplicity

These rules govern IMPLEMENTATION CHOICES ONLY.

They do NOT govern:
- workflow or task sequencing
- brainstorming or design
- planning
- testing strategy or TDD
- debugging process
- verification
- code review process
- subagent usage

When an active workflow or skill such as Superpowers specifies any of those,
follow that workflow. These rules must never override it.

For implementation choices, prefer the smallest correct solution.

Before adding code, use this ladder:

1. Does this need to exist? Avoid speculative requirements and YAGNI.
2. Does equivalent code already exist in the codebase? Reuse it.
3. Can the standard library do it? Prefer that.
4. Can the native platform/framework/database do it? Prefer that.
5. Can an already-installed dependency do it? Reuse it rather than adding another dependency.
6. Prefer the simplest direct implementation over a new abstraction.
7. Only then write the minimum additional code required.

Additional rules:

- No speculative abstractions.
- No interface with one implementation unless there is a concrete reason.
- No factory for one product.
- No configuration for values that do not vary.
- No scaffolding for hypothetical future requirements.
- Prefer deletion over addition when functionality remains correct.
- Prefer fewer files and a smaller correct diff.
- Reuse established codebase patterns rather than inventing new ones.
- Fix bugs at the root cause rather than patching individual symptoms.
- Do not simplify away correctness, security, validation, error handling,
  accessibility, or explicit user requirements.
- Simplicity follows understanding: inspect the relevant code and understand
  the actual flow before choosing the smallest implementation.

Superpowers owns HOW the work is performed.
These rules influence only WHAT CODE is ultimately written.
`;

export default function (pi: any) {
  pi.on("before_agent_start", async (event: any) => {
    const base = event?.systemPrompt ? `${event.systemPrompt}\n\n` : "";

    return {
      systemPrompt: `${base}${SIMPLICITY_RULES}`,
    };
  });
}
