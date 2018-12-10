async printcontract ({ params }) {
    const documentData = await Documents.findOrFail(params.id)

    const docTemp = new Docxtemplater()

    await documentData.load('file')
    const contract = await Contract.findOrFail(params.contract_id)

    await contract.load('soldItems')
    await contract.load('company')

    // console.log(contract.toJSON())

    const account = await Account.findOrFail(contract.account_id)

    await account.load('contacts')
    await account.load('addresses')

    const { file } = documentData.toJSON()
    const { soldItems, company } = contract.toJSON()
    const { contacts, addresses } = account.toJSON()

    const content = fileStream.readFileSync(
      path.resolve(Helpers.tmpPath('uploads'), file.file),
      'binary'
    )

    const zip = new JSZip(content)

    let itemsRecurrent = []
    let itemsUnique = []
    let scsTotalFinal = 0
    let smsTotalFinal = 0
    let dueDates = await this.dueDates(
      contract.scs_due_date,
      contract.scs_installment,
      contract.scs_amount
    )

    for (let solditem of soldItems) {
      const item = await Items.findOrFail(solditem.item_id)

      if (item.type === 'RECORRENTE') {
        itemsRecurrent.push([
          {
            name: item.name,
            quantity: this.formatQuantity(parseFloat(solditem.quantity)),
            sale_price: this.formatPrice(parseFloat(solditem.sale_price)),
            total: this.formatPrice(
              parseFloat(solditem.quantity * solditem.sale_price)
            )
          }
        ])
        smsTotalFinal += solditem.quantity * solditem.sale_price
      } else {
        itemsUnique.push([
          {
            name: item.name,
            info: 'Campo livre',
            amount: this.formatPrice(parseFloat(solditem.sale_price)),
            total: this.formatPrice(
              parseFloat(solditem.quantity * solditem.sale_price)
            )
          }
        ])
        scsTotalFinal += solditem.quantity * solditem.sale_price
      }
    }

    docTemp.loadZip(zip)

    docTemp.setData({
      number: contract.number,
      locale: addresses[0].city,
      date: moment(contract.created_at).format('DD/MM/YYYY'),
      trading_name: company.trading_name,
      responsable: contacts[0].name,
      items_recurrent: itemsRecurrent,
      sms_due_day: contract.sms_due_day,
      sms_due_date: moment(contract.sms_due_date).format('DD/MM/YYYY'),
      base_date: moment(contract.created_at).format('MM'),
      scs_total_final: this.formatPrice(parseFloat(scsTotalFinal)),
      sms_total_final: this.formatPrice(parseFloat(smsTotalFinal)),
      items_unique: itemsUnique,
      scs_due_dates: dueDates,
      accountCompanyName: account.company_name,
      accountDocument: account.document,
      accountContactPhone: contacts[0].phone,
      accountWebSite: account.website,
      accountAddressStreet: addresses[0].street,
      accountAddressState: addresses[0].state,
      accountAddressPostalCode: addresses[0].postal_code,
      responsableMail: contacts[0].email,
      responsableFinan: contacts[1].name,
      responsableFinanPhone: contacts[1].phone,
      responsableFinanMail: contacts[1].email,
      responsableTec: contacts[2].name,
      responsableTecPhone: contacts[2].phone,
      responsableTecMail: contacts[2].email,
      deploymentDate: moment(contract.deployment_date).format('DD/MM/YYYY'),
      grace_period: contract.grace_period,
      pdf_url: ''
    })

    try {
      docTemp.render()
      // console.log(docTemp)
    } catch (error) {
      // console.log(JSON.stringify({ error: e }))
      throw error
    }

    var buf = docTemp.getZip().generate({ type: 'nodebuffer' })

    // buf is a nodejs buffer, you can either write it to a file or do anything else with it.
    await fileStream.writeFileSync(
      path.resolve(
        Helpers.tmpPath('uploads'),
        'Contrato_' + contract.number + '.docx'
      ),
      buf
    )

    let pdfLocation = ''
    let pdfURL = ''

    await convertapi
      .convert(
        'pdf',
        {
          File: path.resolve(
            Helpers.tmpPath('uploads'),
            'Contrato_' + contract.number + '.docx'
          )
        },
        'docx'
      )
      .then(function (result) {
        // get converted file url
        // console.log('Converted file url: ' + result.file.url)

        pdfURL = result.file.url
        pdfLocation = path.resolve(
          Helpers.tmpPath('uploads'),
          'Contrato_' + contract.number + '.pdf'
        )

        // save to file
        return result.file.save(pdfLocation)
      })

    return {
      generated_file: path.resolve(
        Helpers.tmpPath('uploads'),
        'Contrato_' + contract.number + '.docx'
      ),
      pdf_location: pdfLocation,
      pdf_url: pdfURL
    }
  }
