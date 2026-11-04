# Homework 2: Test Generation and Improvement Using

# Coding Agents

**Due Date:** November 8, 2026, at 11:59 PM
**Weight:** 10% of the final course grade

## Overview

In Homework 1, you developed a web application using a coding agent. In this assignment, you
will use a coding agent to **generate and improve automated test cases** for that application.

The goal of this assignment is to explore how effectively coding agents can understand an existing
application, generate meaningful tests for its functionality, and improve those tests based on
additional context and execution feedback.

You will evaluate the generated tests in terms of **code coverage, test correctness, and fault
detection capability**. You will also experiment with different ways of guiding the coding agent to
improve the quality of its tests.

## Part 1: Generate an Initial Test Suite

Use a coding agent (e.g., Claude Code, Codex, or another coding agent of your choice) to generate
automated tests for the web application you developed in Homework 1.

Your tests should cover the application's main functionality, including normal use cases, edge
cases, and error handling behavior where applicable.

You may use any appropriate testing framework, such as Jest, Pytest, or Playwright, depending on
your application's technology stack.

**Requirements:**

- Use a coding agent to examine the existing application and generate an initial test suite.
- Ensure the tests are executable and include assertions that check the application's
    expected behavior.
- Run the generated tests and record the results.
- Review the tests to identify any incorrect, redundant, or missing test cases.

## Part 2: Evaluate the Generated Tests

Evaluate the quality of your initial test suite using the following three measures.


**1. Code Coverage**

Measure how much of your application's code is exercised by the generated tests. You may use
line coverage, branch coverage, or other appropriate coverage metrics supported by your testing
framework.

Identify important functionality or code paths that are not adequately covered.

**2. Test Correctness**

Examine whether the generated tests correctly capture the expected behavior of your application.

In particular, consider:

- Do the tests check the application's actual requirements and intended functionality?
- Are the test inputs and expected outputs correct?
- Do the tests contain meaningful assertions rather than merely checking that the
    application runs?
- Are any tests incorrect, flaky, or based on assumptions that do not match the application's
    intended behavior?

Note that a test passing does not necessarily mean it is correct.

**3. Fault-Detection Capability**

Examine whether the generated tests detect any existing bugs in your application.

If the tests uncover bugs, document each bug, explain the incorrect behavior, and describe which
test cases detected it. If no bugs are detected, simply report that no bugs were found.

## Part 3: Iteratively Improve the Test Suite

Use your coding agent to improve the initial test suite based on the problems identified in Part 2.

Experiment with providing additional context or feedback to the coding agent. For example, you
may:

- Provide more information about the application's requirements and expected behavior.
- Point the agent to important source files or functionality that it initially overlooked.
- Share test execution results, error messages, or coverage reports.
- Ask the agent to improve weak assertions, correct invalid tests, or generate tests for
    uncovered functionality.
- Provide feedback about bugs or incorrect application behavior revealed by the initial
    tests, if any.


Perform **at least two rounds of test improvement** after the initial generation. You are
encouraged to experiment with different strategies rather than simply asking the agent to
generate more tests.

After the improvements, rerun your tests and evaluate the final test suite using the same
measures from Part 2.

Compare the initial and final test suites to determine whether your improvements actually
increased test quality.

## Part 4: Submission and Report

Push your final test suite to the GitHub repository used for Homework 1. Make sure the tests can
be executed and that your repository includes any necessary configuration files and instructions.

Submit a PDF report containing the following sections:

**1. Test Generation Approach**
    - Describe how you instructed the agent to generate the initial tests.
    - Summarize the number and types of tests generated and the application functionality they
       target.
**2. Initial Test Evaluation**
    - Report the code coverage and test execution results of the initial test suite.
    - Discuss any incorrect tests, weak assertions, or important functionality that was missed.
    - Document any bugs detected by the generated tests. If no bugs were detected, state that
       explicitly.
**3. Iterative Test Improvement**
    - Explain how you guided the coding agent to improve the tests in each iteration.
    - Provide representative examples of the additional context, prompts, or execution
       feedback you gave the agent.
    - Describe the changes made to the test suite and why they were necessary.
**4. Final Evaluation**
    - Report the code coverage and test correctness of the final test suite, along with any bugs
       detected.
    - Compare the initial and final results. You are encouraged to use tables to summarize the
       differences.
    - Discuss which improvements were effective and which were not.
**5. Reflection**


- How well did the coding agent understand your application's functionality?
- What types of tests did it generate well, and where did it struggle?
- How useful were additional context and execution feedback in improving its
    performance?
- What did you learn about the strengths and limitations of coding agents for software
    testing?
**6. GitHub Repository**
- Provide a link to your GitHub repository and indicate where the final test suite is located.
- Include clear instructions for installing dependencies, running the tests, and reproducing
the coverage results.

## Important Notes

- **You must use a coding agent** for both initial test generation and iterative improvement.
    You may manually inspect or correct generated tests, but describe any significant manual
    interventions in your report.
- Focus on **test quality rather than the number of test cases**. A large test suite with weak
    assertions or redundant tests is not necessarily better than a smaller, well-designed suite.
- Use the application's intended behavior as the basis for evaluating test correctness. Do
    not change the application's requirements simply to make generated tests pass.
- Distinguish between test failures caused by bugs in the application and failures caused by
    incorrect test cases.
- Your report should include concrete evidence, such as test results, coverage
    measurements, examples of detected bugs (if any), and examples of agent interactions, to
    support your observations.

**Submission Deadline:** November 8, 2026, at 11:59 PM.

Submit your report as a PDF. Your final test suite should be available in your GitHub repository
by the submission deadline.


