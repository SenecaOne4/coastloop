sub init()
    m.top.functionName = "execute"
end sub

sub execute()
    req = m.top.request

    if req = invalid
        m.top.response = {
            ok: false
            action: ""
            error: "missing request"
        }
        return
    end if

    port = CreateObject("roMessagePort")
    xfer = CreateObject("roUrlTransfer")

    xfer.SetMessagePort(port)
    xfer.SetCertificatesFile("common:/certs/ca-bundle.crt")
    xfer.InitClientCertificates()
    xfer.SetUrl(req.url)
    xfer.AddHeader("Content-Type", "application/json")
    xfer.AddHeader("Accept", "application/json")

    body = "{}"
    if req.body <> invalid
        body = FormatJson(req.body)
    end if

    started = xfer.AsyncPostFromString(body)

    if started <> true
        m.top.response = {
            ok: false
            action: req.action
            error: "request did not start"
        }
        return
    end if

    event = wait(15000, port)

    if event = invalid
        xfer.AsyncCancel()
        m.top.response = {
            ok: false
            action: req.action
            error: "request timeout"
        }
        return
    end if

    if type(event) <> "roUrlEvent"
        m.top.response = {
            ok: false
            action: req.action
            error: "unexpected network event"
        }
        return
    end if

    code = event.GetResponseCode()
    text = event.GetString()

    if code < 200 or code >= 300
        m.top.response = {
            ok: false
            action: req.action
            error: "http " + code.ToStr()
        }
        return
    end if

    if text = invalid or text = ""
        m.top.response = {
            ok: false
            action: req.action
            error: "empty response"
        }
        return
    end if

    data = ParseJson(text)

    if data = invalid
        m.top.response = {
            ok: false
            action: req.action
            error: "invalid json"
        }
        return
    end if

    m.top.response = {
        ok: true
        action: req.action
        data: data
    }
end sub
