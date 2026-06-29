describe("Student real E2E flow (no mocks)", () => {
  it("registers, uploads a real ZIP, submits required reflection, and sees submissions", () => {
    const uniqueEmail = `e2e_student_${Date.now()}@test.local`;
    const password = "123456";

    cy.visit("/");

    cy.contains(".auth-tab", "Create account").click();
    cy.get('input[type="email"]').clear().type(uniqueEmail);
    cy.get('input[type="password"]').clear().type(password);
    cy.get("form.form-grid select").select("Student");
    cy.get("form.form-grid").within(() => {
      cy.contains("button", "Create account").click();
    });

    // Logged in state
    cy.contains(".user-chip", uniqueEmail, { timeout: 15000 }).should("be.visible");
    cy.contains("h2", "Assignments").should("be.visible");

    // Pick FizzBuzz assignment and upload real ZIP solution
    cy.contains("button.assignment-item", "FizzBuzz").click();
    cy.get('input[type="file"]').selectFile("cypress/fixtures/fizzbuzz_valid.zip", {
      force: true
    });
    cy.contains("button", "Submit assignment").click();

    // Required reflection modal appears immediately after submission
    cy.contains("h3", "Reflection (required)", { timeout: 15000 }).should("be.visible");
    cy.get('textarea[placeholder="Describe what you learned..."]').type(
      "I learned to prioritize divisibility checks and return consistent string outputs."
    );
    cy.get('textarea[placeholder="Describe any challenges..."]').type(
      "I initially handled zero incorrectly and had condition-order bugs."
    );
    cy.contains("label", "I wrote the code mostly myself (1-5)")
      .find("select")
      .select("4");
    cy.contains("label", "AI tool usage during this task")
      .find("select")
      .select("Sometimes");
    cy.contains("label", "I reflected on my problem-solving strategy (1-5)")
      .find("select")
      .select("4");

    cy.contains("button", "Submit reflection").click();

    // Modal should close after successful reflection submit
    cy.contains("h3", "Reflection (required)").should("not.exist");

    // Verify submission list is reachable and populated
    cy.contains("button", "My Submissions").click();
    cy.contains("h2", "My submissions").should("be.visible");
    cy.get(".submission-table-row", { timeout: 15000 }).should("have.length.greaterThan", 0);
  });
});
