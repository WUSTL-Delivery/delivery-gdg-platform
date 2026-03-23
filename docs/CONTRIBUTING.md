<!-- omit in toc -->
# Contributing to delivery-gdg-platform

First off, thanks for taking the time to contribute! ❤️

All types of contributions are encouraged and valued. See the [Table of Contents](#table-of-contents) for different ways to help and details about how this project handles them. Please make sure to read the relevant section before making your contribution. It will make it a lot easier for us maintainers and smooth out the experience for all involved. The community looks forward to your contributions. 🎉

> And if you like the project, but just don't have time to contribute, that's fine. There are other easy ways to support the project and show your appreciation, which we would also be very happy about:
> - Star the project
> - Tweet about it
> - Refer this project in your project's readme
> - Mention the project at local meetups and tell your friends/colleagues

<!-- omit in toc -->
## Table of Contents

- [I Have a Question](#i-have-a-question)
- [I Want To Contribute](#i-want-to-contribute)
- [Styleguides](#styleguides)



## I Have a Question

> If you want to ask a question, we assume that you have read the available [Documentation](https://github.com/WUSTL-Delivery/delivery-gdg-platform/tree/main/docs).

Before you ask a question, it is advisable to search the internet or context within the codebase for answers first.

If you then still feel the need to ask a question and need clarification, we recommend the following:

- Contact @tylrdinh / @jaximus808 on Discord or Slack
- Provide as much context as you can about what you're running into.
- Provide project and platform versions (nodejs, npm, etc), depending on what seems relevant.

We will then take care of the issue as soon as possible.

<!--
You might want to create a separate issue tag for questions and include it in this description. People should then tag their issues accordingly.

Depending on how large the project is, you may want to outsource the questioning, e.g. to Stack Overflow or Gitter. You may add additional contact and information possibilities:
- IRC
- Slack
- Gitter
- Stack Overflow tag
- Blog
- FAQ
- Roadmap
- E-Mail List
- Forum
-->

## I Want To Contribute

### Submitting an Issue

This section guides you through submitting an issue for delivery-gdg-platform, **including completely new features and minor improvements to existing functionality**. We use Linear issues to track the project.

<!-- omit in toc -->
#### Before Submitting an Issue

- Make sure that you are using the latest version.
- Read the [documentation](https://github.com/WUSTL-Delivery/delivery-gdg-platform/tree/main/docs) carefully and find out if the functionality is already covered, maybe by an individual configuration.
- Perform a search on Linear to see if the enhancement has already been suggested. If it has, add a comment to the existing issue instead of opening a new one.
- Find out whether your idea fits with the scope and aims of the project. It's up to you to make a strong case to convince the project's developers of the merits of this feature. Keep in mind that we want features that will be useful to the majority of our users and not just a small subset. If you're just targeting a minority of users, consider writing an add-on/plugin library.

<!-- omit in toc -->
#### How Do I Submit a Good Issue?

Enhancements are tracked on Linear.

- Use a **clear and descriptive title** for the issue to identify the suggestion.
- Provide a **step-by-step description of the suggested enhancement** in as many details as possible.
- **Describe the current behavior** and **explain which behavior you expected to see instead** and why. At this point you can also tell which alternatives do not work for you.
- You may want to **include screenshots or screen recordings** which help you demonstrate the steps or point out the part which the suggestion is related to. You can use [LICEcap](https://www.cockos.com/licecap/) to record GIFs on macOS and Windows, and the built-in [screen recorder in GNOME](https://help.gnome.org/users/gnome-help/stable/screen-shot-record.html.en) or [SimpleScreenRecorder](https://github.com/MaartenBaert/ssr) on Linux. <!-- this should only be included if the project has a GUI -->
- **Explain why this enhancement would be useful** to most delivery-gdg-platform users. You may also want to point out the other projects that solved it better and which could serve as inspiration.

<!-- You might want to create an issue template for enhancement suggestions that can be used as a guide and that defines the structure of the information to be included. If you do so, reference it here in the description. -->

### Code Contributions

To test the client interface: 

For deployments (Kafka Zookeeper):
cd deployments
Install Docker Desktop
docker-compose up -d 
go to http://localhost:8080/

For authoritative:
cd apps/authoritative
go run cmd/authoritative/main.go 

For web interface:
cd apps/client/web 
npm install
npm run dev 
Then visit http://localhost:3000/

## Styleguides
### Commit Messages

Please use [Conventional Commits](https://gist.github.com/qoomon/5dfcdf8eec66a051ecd85625518cfd13) as described in this GitHub Gist.

## Join The Project
DSC @ WashU recruits at the start of each academic semester!

<!-- omit in toc -->
## Attribution
This guide is based on [contributing.md](https://contributing.md/generator)!
