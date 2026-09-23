# Network Inspection & Console

## Network inspection

```bash
playwright-cli requests                 # list all network requests
playwright-cli request <index>          # full details of request N
playwright-cli request-headers <index>  # request headers only
playwright-cli request-body <index>     # request body only
playwright-cli response-headers <index> # response headers only
playwright-cli response-body <index>    # response body
```

Useful for:
- Capturing API calls sites make internally
- Extracting CSRF tokens from request headers
- Debugging failed requests

## Console

```bash
playwright-cli console                  # all console messages
playwright-cli console error            # only errors
playwright-cli console warning          # only warnings
```
