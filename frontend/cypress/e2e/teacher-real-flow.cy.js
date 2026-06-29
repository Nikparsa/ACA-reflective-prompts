describe("Teacher real E2E flow (no mocks)", () => {
  it("registers as teacher and edits an assignment with real API", () => {
    const email = `e2e_teacher_${Date.now()}@test.local`;
    const password = "123456";
    const marker = `[E2E ${Date.now()}]`;
    let baseDescription = "";

    cy.visit("/");

    cy.contains(".auth-tab", "Create account").click();
    cy.get("form.form-grid").within(() => {
      cy.get('input[type="email"]').clear().type(email);
      cy.get('input[type="password"]').clear().type(password);
      cy.get("select").select("Teacher");
      cy.contains("button", "Create account").click();
    });

    cy.contains(".user-chip", email, { timeout: 15000 }).should("be.visible");
    cy.contains("button", "Assignments").click();

    cy.contains("button.assignment-item", "FizzBuzz", { timeout: 15000 }).click();
    cy.get(".submission-panel header p")
      .should("be.visible")
      .invoke("text")
      .then((text) => {
        baseDescription = text.trim().replace(/\s*\[E2E \d+\]$/g, "");
      });

    // Update description
    cy.contains("button", "Edit assignment").click();
    cy.get(".modal-form").within(() => {
      cy.get('input[placeholder="Short summary shown to students"]')
        .clear()
        .type(`${baseDescription} ${marker}`);
      cy.contains("button", "Save changes").click();
    });
    cy.contains("Assignment updated successfully.", { timeout: 15000 }).should("be.visible");
    cy.contains("button.assignment-item", "CSV Statistics").click();
    cy.contains("button.assignment-item", "FizzBuzz").click();
    cy.get(".submission-panel header p", { timeout: 15000 }).should("contain", marker);

    // Restore original description to avoid persisting test mutations
    cy.contains("button", "Edit assignment").click();
    cy.get(".modal-form").within(() => {
      cy.get('input[placeholder="Short summary shown to students"]')
        .clear()
        .type(baseDescription);
      cy.contains("button", "Save changes").click();
    });
    cy.contains("Assignment updated successfully.", { timeout: 15000 }).should("be.visible");
    cy.contains("button.assignment-item", "CSV Statistics").click();
    cy.contains("button.assignment-item", "FizzBuzz").click();
    cy.get(".submission-panel header p", { timeout: 15000 })
      .invoke("text")
      .then((text) => {
        expect(text.trim()).to.eq(baseDescription);
      });
  });
});
