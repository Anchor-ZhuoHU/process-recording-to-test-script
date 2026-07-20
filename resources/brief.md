# Process Recording Take Home

> Verbatim transcription of the assignment brief (a PDF handed to me in another company's
> interview process). The original file is withheld from this repo because it embeds the
> issuing company's file links and an API key. The text below is 1:1, with only the API key
> redacted and the example-videos link replaced with my own shared folder; typography is
> lightly normalized for markdown.

## Time/format

- 3.5 hours in total.
- 3 hours to build the solution.
- 30 minute debrief at the end where we will talk about your solution, and any technical
  considerations.

## Goal

Consultants at the system integrators we work with often have to create "Test scripts". These
are documents that tell you how to do a certain process, such as "creating a purchase order".
In essence, they are just a list of steps, each with a screenshot.

Today, consultants do this by hand and it takes them up to 45 minutes to document one process
that takes 2 minutes to complete. Your goal is to ingest this video and use the Gemini Video
Understanding API to extract out the steps and screenshots (hint: Gemini can return you
timestamps). Your goal is to create a webapp where users can upload a video of a screen
recording, and get a list of steps with the screenshots of what they did.

You can expect videos to be under 3 minutes in length. You can also record your own screen
recordings. On Mac, you can use QuickTime Player. Go to File, New Screen Recording.

We recommend using Next.js for this, but feel free to use whatever framework/languages you are
most comfortable with.

## Resources

- [Example videos](https://drive.google.com/drive/folders/1DKdyQTxiAWhL0bo_pDa6XWFpMco8ly0K?usp=sharing) -
  feel free to use these as the input *(link replaced with my own shared folder of the sample
  videos)*
- Gemini API Key (for video processing) *(redacted)*

## Expectations and success criteria

You are welcome, if not encouraged, to use AI coding agents. However, ensure code quality is
clean and follows good principles. Pretend you're building this product for real and have to
maintain it! We will be looking at the code.

You will be judged on both the technical quality of the solution, as well as your product
sense. We are not looking for any super spectacular or special UI or designs, but keep it
sensible and prioritize usability and professionalism.

Though we expect you to have something functional by the end, I'd say, at least part 1,
completion is not key - but your approach and justifications for decisions are.

## Part 1: Converting video to steps

Users should be able to upload a video, and our backend will process it, and return the list
of steps with screenshots. Feel free to decide on the best interface here, but a simple list
or table would do.

We should have the following items/columns per step:

- Action (high level description)
- Description
- Expected Result
- Screenshot
- (optional) Timestamp

## Part 2: Flexible columns

Users should be able to define their own items/columns that are generated for each step, as
per some sort of configuration interface. Make sure that this doesn't break the generation.
This is because different clients often have different templates that they would want to use
