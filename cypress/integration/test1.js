describe('Test 1', () => {
  it('finds the content "type"', () => {
    cy.visit('https://example.cypress.io')
    cy.contains('type')
  })
})
