function registerThroughUi(email, password, role) {
  cy.contains(".auth-tab", "Create account").click();
  cy.get("form.form-grid").within(() => {
    cy.get('input[type="email"]').clear().type(email);
    cy.get('input[type="password"]').clear().type(password);
    cy.get("select").select(role);
    cy.contains("button", "Create account").click();
  });
}

describe("Auth and role-based navigation", () => {
  it("shows student sections after student login", () => {
    const email = `e2e_nav_student_${Date.now()}@test.local`;
    const password = "123456";

    cy.visit("/");
    registerThroughUi(email, password, "Student");

    cy.contains(".user-chip", email, { timeout: 15000 }).should("be.visible");
    cy.contains("h2", "Assignments").should("be.visible");
    cy.contains("My Submissions").should("be.visible");
    cy.contains("Teacher Center").should("not.exist");
    cy.get("button.assignment-item").should("have.length.greaterThan", 0);
  });

  it("shows teacher center after teacher login", () => {
    const email = `e2e_nav_teacher_${Date.now()}@test.local`;
    const password = "123456";

    cy.visit("/");
    registerThroughUi(email, password, "Teacher");

    cy.contains(".user-chip", email, { timeout: 15000 }).should("be.visible");
    cy.contains("Teacher Center").should("be.visible");
    cy.contains("My Submissions").should("not.exist");
    cy.contains("button", "Assignments").click();
    cy.contains("button", "Edit assignment").should("be.visible");
  });
});
