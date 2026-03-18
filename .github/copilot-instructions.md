# GitHub Copilot Instructions

** Important: For every agent creating a pull request, ensure that these instructions are followed and updated as necessary. Keep it short!**

## Project Overview

PolyEconGame is a Next.js 15 application with a companion worker thread.
The web application is a full-stack TypeScript app with modern tooling and containerized deployment.
The worker thread conducts a socio-economic time-discrete simulation

## Code Quality Standards

Please reduce comments to an absolute minimum. We consider comments as technical debt when the code isn't readable and understandable enough.

So when you want to add a comment, ask yourself, how can i express the code better such that a comment becomes superflouos. If there is a deeper decision made by code, a comment is okay.

### Testing Standards

-> HIGH! test coverage expected
-> !NO MAGIC STRINGS!
-> When possible build fixtures for reusable test data

### Development Workflow

Run (and be aware, that this takes a while)

    ```bash
    npm run test:all
    ```

before finishing a task. It will format, lint, build and test the source code. Only e2e wont run and when this command succeds the CI will be happy. If you want to run only unit tests, use

    ```bash
    npm run test:unit
    ```

#### UI Components

# shadcn/ui

> shadcn/ui is a collection of beautifully-designed, accessible components and a code distribution platform. It is built with TypeScript, Tailwind CSS, and Radix UI primitives.
