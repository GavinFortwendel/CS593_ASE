# Homework 1: Build an AI Research Assistant with a Coding Agent 

**Due:** October 10, 11:59 PM **Weight:** 10% of the final course grade 

## **Overview** 

In this homework, you will use a **coding agent of your choice** to build a small but complete web application, an AI Research Assistant. 

The goal of this assignment is not to practice web development, but rather getting hands-on experience using a coding agent for end-to-end software development, including understanding requirements, designing the application, implementing the frontend and backend, integrating external APIs and an LLM, debugging problems, managing persistent data, and deploying a working application. 

You can use any coding agent you prefer. There is also no requirement on the programming languages, frameworks, databases, and LLMs used in your application. 

Completing a functional web application is an important part of this assignment, but reflecting on your experience of using a coding agent is equally important to the learning goals of the homework. The web application will account for 60% of the homework grade, and the reflection report will account for 40%. 

## **Application Requirements** 

Researchers frequently need to search for papers, organize papers they want to read, understand unfamiliar papers, and ask questions about their content. Your task is to build an **AI Research Assistant** that supports this workflow. 

At minimum, your application must allow a user to: 

#### **1. Search for Research Papers** 

The user should be able to enter keywords or a research topic and search for relevant research papers. Your application may use any suitable public paper-search API or service. Your application should render the search results with information such as: 

- Paper title 

- Authors 

- Publication year 

- Abstract 

- Link to the paper, when available 

#### **2. Save Papers to a Local Library** 

The user should be able to select papers from the search results and save them to a local database for further analysis and investigation. Saved papers should still be available after the application is restarted or the page is refreshed. The user should also be able to browse previously saved papers. 

#### **3. Upload PDF Papers** 

The user should be able to upload a research paper in PDF format and add it to the local database. After a paper is uploaded, your application should extract the paper title, authors, publication year, and paper abstract so that it can be properly rendered in the application in a similar way like the papers in search results. 

### **4. Summarize Papers with an LLM** 

The user should be able to select a paper and ask an LLM to generate a summary of the paper. The summary should be based on the content of the selected paper rather than only its title or metadata. 

### **5. Ask Questions About a Paper** 

The user should be able to ask natural-language questions about a selected paper. For example: 

- What problem does this paper address? 

- What is the main idea of the proposed approach? 

- What datasets are used? 

- What are the major limitations? 

- How does this method compare with the baselines? 

In summary, your application must include all of the following: 

- A graphical user interface 

- Frontend and backend logic 

- Integration with at least one external API for paper search or related functionality 

- • A local database to store and retrieve papers 

- PDF upload and processing 

- Integration with an LLM API to summarize papers and answer user questions 

You are free to choose your own software stack. Your application does **not** need to be production quality. Focus on building a reasonably functional end-to-end system. 

Testing is not the main focus of HW1. In HW2, you will use a coding agent to generate and improve tests for the application you build here. 

## **Using a Coding Agent** 

A major purpose of this homework is to experience how coding agents change the softwaredevelopment process. **You should use your coding agent throughout development rather than only asking it to generate an initial code skeleton.** 

For example, you may use the agent to: 

- Plan the architecture 

- Set up the project 

- Suggest a Javascript framework for frontend development 

- Implement frontend and backend components 

- Integrate databases and external APIs 

- Search for a PDF processing skill and install it (be careful about <u>toxic skills)</u> 

- Understand unfamiliar libraries or generated code 

- Diagnose errors 

- Debug the application 

- Refactor code 

- Configure deployment 

You remain responsible for the final application. You should understand the major components of your system and verify that agent-generated code behaves correctly. 

**Do not commit API keys, passwords, or other credentials to your GitHub repository.** 

## **Submission** 

Submit the following materials on Brightspace. 

#### **1. GitHub Repository** 

Provide a link to your GitHub repository. 

The repository should contain: 

- Complete source code 

- A `README` with setup and execution instructions 

- A description of the major features 

- Any necessary dependency/configuration files 

Someone following your README should be able to understand how the application is structured and how to run it. 

### **2. Demo Video** 

Submit a short video demonstrating your application. Your demo should show the major required functionality, including: 

1. Searching for a paper 

2. Saving a paper to the library 

3. Uploading a PDF 

4. Generating a paper summary 

5. Asking at least one question about a paper 

### **3. A Reflection on Your Experience Using the Coding Agent** 

Submit a report reflecting on your experience using the coding agent. There is no minimum page requirement or page limit. Focus on providing a genuine and thoughtful discussion of your experience, e.g., what worked, what didn’t work, what surprised you, etc. This report will be assessed based on the quality of the discussion and reflection, not its length. 

Please discuss: 

1. Which coding agent did you use, and how did you use it? 2. Which parts of the assignment was the agent particularly useful for? 

3. Describe the situations where the agent generated incorrect, incomplete, or otherwise unsatisfactory code. What happened, and how did you address it? Please **include screenshots of your interaction** with the coding agent that show the relevant context, such as the instructions or prompts you gave the agent, the agent’s reasoning trajectory or intermediate output if visible, the code or solution it proposed, and your follow-up instructions or corrections. The screenshots should make it clear how the problem emerged and how you guided the agent toward a better solution. 

4. How much did you need to inspect, modify, or debug agent-generated code? 

5. What did you learn about effectively communicating with and controlling a coding agent? 

