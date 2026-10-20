sub Main()
    screen = CreateObject("roSGScreen")
    port = CreateObject("roMessagePort")
    screen.SetMessagePort(port)

    appMemoryMonitor = CreateObject("roAppMemoryMonitor")
    appMemoryMonitor.SetMessagePort(port)

    memoryEventsEnabled = appMemoryMonitor.EnableMemoryWarningEvent(true)
    memoryPercent = appMemoryMonitor.GetMemoryLimitPercent()
    memoryAvailable = appMemoryMonitor.GetChannelAvailableMemory()
    memoryLimits = appMemoryMonitor.GetChannelMemoryLimit()

    fallbackDeviceInfo = invalid
    if memoryEventsEnabled <> true
        fallbackDeviceInfo = CreateObject("roDeviceInfo")
        fallbackDeviceInfo.SetMessagePort(port)
        fallbackDeviceInfo.EnableLowGeneralMemoryEvent(true)
    end if

    scene = screen.CreateScene("MainScene")
    screen.Show()

    while true
        msg = wait(0, port)
        msgType = type(msg)

        if msgType = "roSGScreenEvent"
            if msg.IsScreenClosed() then return
        else if msgType = "roAppMemoryNotificationEvent"
            info = msg.GetInfo()
            if info <> invalid
                usage = info.Lookup("memoryUsagePercent")
                if usage <> invalid
                    print "CoastLoop memory usage percent: "; usage
                end if
            end if
        else if msgType = "roDeviceInfoEvent"
            info = msg.GetInfo()
            if info <> invalid
                level = info.Lookup("generalMemoryLevel")
                if level <> invalid
                    print "CoastLoop general memory level: "; level
                end if
            end if
        end if
    end while
end sub
