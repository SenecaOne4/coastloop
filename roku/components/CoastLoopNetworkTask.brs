sub init()
    m.top.functionName = "execute"
end sub

sub execute()
    req = m.top.request

    if req = invalid
        m.top.response = { ok: false, action: "", error: "missing request" }
        return
    end if

    xfer = CreateObject("roUrlTransfer")
    xfer.SetCertificatesFile("common:/certs/ca-bundle.crt")
    xfer.InitClientCertificates()
    xfer.SetUrl(req.url)
    xfer.AddHeader("Content-Type", "application/json")
    xfer.AddHeader("Accept", "application/json")

    body = "{}"
    if req.body <> invalid
        body = FormatJson(req.body)
    end if

    text = xfer.PostFromString(body)

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
