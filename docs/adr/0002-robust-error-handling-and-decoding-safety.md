# ADR 0002: Robust Error Handling and Decoding Safety in Media Pipeline

Status: accepted  
Date: 2026-07-16  

## Context

In the media processing pipeline, the worker calls several third-party APIs (Google Cloud Vision SafeSearch, Google Cloud Vision Label Detection, HuggingFace Inference API) and uses `sharp` to process/decode images. 
During the codebase audit, several fragility issues were identified:
1. Google Cloud Vision API individual requests can fail (e.g., due to rate limits or formatting issues) but still return a 200 HTTP status code with an `error` object inside the `responses` array. The worker was silently ignoring these errors and treating the images as safe and having no labels, bypassing the content safety filter.
2. The HuggingFace BLIP captioning model can return error objects (such as when the model is loading) that are not arrays. The worker would throw an obscure `TypeError` (attempting to destructure an object as an array) rather than surfacing the actual API loading error.
3. If `sharp` fails to decode a corrupt image buffer, it throws a decoding error. The worker was treating this as a generic `INTERNAL_ERROR` and retrying the job, wasting resources and worker time on an unrecoverable error.

## Decisions

### 1. Robust API Error Checking
- **Google Cloud Vision API**: We explicitly inspect `responses[0]?.error` and throw a descriptive error if it exists. This ensures that failures in labeling or safety annotation block completion and trigger proper error handling/retries, instead of silently passing safety checks.
- **HuggingFace API**: We validate the response object structure. If the API returns a JSON object with an `error` key (e.g., model loading state), we extract and throw the error message. We also verify that the response is a non-empty array with the expected structure before processing.

### 2. Immediate Failure for Decoding/Corrupt Images
- **Implementation**: We wrap the `sharp` buffer decoding call inside `readAndValidateImage` with a `try-catch`. If decoding fails, we throw an `ImageValidationError` with the `INVALID_FILE` code.
- **Result**: This immediately classifies the failure as non-retryable, marking it as `FAILED` in the database and calling `job.discard()` to prevent BullMQ from wasting retries and CPU time on corrupt images. R2/Network download issues continue to propagate normally as retryable errors.
